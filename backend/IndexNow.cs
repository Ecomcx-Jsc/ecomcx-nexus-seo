using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using Cms.Plugin.Sdk;
using Cms.Plugin.Sdk.Jobs;
using Cms.Plugin.Sdk.Contracts;
using Cms.Plugin.Sdk.Hooks;
using Cms.Plugin.Sdk.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

using Cms.Plugin.Sdk.Localization;
namespace EcomcxSeo;

public sealed record SubmitInput(List<string> Urls);
public sealed record IndexNowLog(long Id, List<string> Urls, int Status, string Message, string Source, DateTimeOffset CreatedAt);

/// <summary>
/// IndexNow: báo Bing, Yandex, Seznam, Naver… ngay khi bài được đăng/sửa/xoá (thay vì chờ máy tìm kiếm tự quét).
/// Khoá xác minh phục vụ ở /indexnow-key.txt (route gốc của plugin) và khai báo qua keyLocation.
/// </summary>
public static class IndexNow
{
    public const string Table = "ecx_seo_indexnow";
    private const string Endpoint = "https://api.indexnow.org/indexnow";
    public const string KeyPath = "/indexnow-key.txt";

    public static void Register(IPluginContext ctx)
    {
        RegisterJob(ctx);
        ctx.Migrations.Add("003_indexnow", $"""
            create table if not exists {Table} (
                id bigserial primary key,
                urls jsonb not null default '[]',
                status int not null,
                message text not null default '',
                source text not null default 'auto',
                created_at timestamptz not null default now()
            );
            """, $"drop table if exists {Table}");

        // Sửa bài đã đăng → gửi lại; đăng lần đầu (kể cả đăng theo lịch) do post.published xử lý
        ctx.Hooks.On<PostEvent>(HookNames.PostSaved, (e, h) =>
            e.Post.Status == "publish" && e.Previous?.Status == "publish" ? QueueAsync(h.Services, e.Post) : Task.CompletedTask);
        ctx.Hooks.On<PostEvent>(HookNames.PostPublished, (e, h) => QueueAsync(h.Services, e.Post));
        ctx.Hooks.On<PostEvent>(HookNames.PostDeleted, (e, h) => e.Post.Status == "publish" ? QueueAsync(h.Services, e.Post) : Task.CompletedTask);

        ctx.Endpoints.Map(r =>
        {
            // Public: website phục vụ khoá ở /indexnow-key.txt
            r.MapGet("/indexnow/key", async (IOptionStore options, CancellationToken ct) =>
            {
                var s = await SeoSettings.LoadAsync(options, ct);
                if (!SeoSettings.Bool(s["modules"]?["indexNow"], true)) return Results.NotFound();
                return Results.Ok(new { key = await EnsureKeyAsync(options, ct) });
            });

            r.MapGet("/indexnow", async (IOptionStore options, IDbConnectionFactory db, CancellationToken ct) =>
            {
                var key = await EnsureKeyAsync(options, ct);
                var site = await SiteUrlAsync(options, ct);
                await using var conn = await db.OpenAsync(ct);
                var history = await Db.QueryAsync(conn, $"select id, urls, status, message, source, created_at from {Table} order by id desc limit 100",
                    r => new IndexNowLog(r.GetInt64(0), JsonSerializer.Deserialize<List<string>>(r.GetString(1)) ?? [], r.GetInt32(2), r.GetString(3), r.GetString(4), r.GetFieldValue<DateTimeOffset>(5)), ct);
                return Results.Ok(new { key, keyLocation = site + KeyPath, siteUrl = site, history });
            }).RequireCapability(Caps.Settings);

            r.MapPost("/indexnow/submit", async (SubmitInput input, IOptionStore options, IDbConnectionFactory db, IHttpClientFactory http, CancellationToken ct) =>
            {
                var site = await SiteUrlAsync(options, ct);
                var urls = input.Urls.Select(u => u.Trim()).Where(u => u.Length > 0).Select(u => u.StartsWith('/') ? site + u : u).Distinct().Take(10_000).ToList();
                if (urls.Count == 0) return Results.Json(new { title = Text.T("ecomcx-seo:indexNow.enter_at_least_one_url") }, statusCode: 422);
                var host = Uri.TryCreate(site, UriKind.Absolute, out var su) ? su.Host : "";
                if (urls.Any(u => !Uri.TryCreate(u, UriKind.Absolute, out var x) || x.Host != host))
                    return Results.Json(new { title = Text.T("ecomcx-seo:indexNow.only_urls_of_this_website") }, statusCode: 422);
                var (status, message) = await SendAsync(http, options, urls, ct);
                await LogAsync(db, urls, status, message, "manual", ct);
                return Results.Ok(new { status, message });
            }).RequireCapability(Caps.Settings);

            r.MapPost("/indexnow/regenerate", async (IOptionStore options, CancellationToken ct) =>
            {
                var s = await SeoSettings.LoadAsync(options, ct);
                s["indexNow"]!["key"] = NewKey();
                await options.SetAsync(SeoSettings.OptionKey, s, autoload: true, ct: ct);
                return Results.Ok(new { key = SeoSettings.Str(s["indexNow"]?["key"]) });
            }).RequireCapability(Caps.Settings);
        });
    }

    public const string JobType = "ecomcx-seo:indexnow";
    private static readonly string ConnectFailed = Text.T("ecomcx-seo:indexNow.couldn_t_connect_to_indexnow");
    public sealed record IndexNowJob(string Link);

    /// <summary>
    /// Gửi qua hàng đợi việc nền của CMS: không làm chậm việc lưu bài, không mất khi hệ thống khởi động lại,
    /// tự thử lại khi máy tìm kiếm bận/lỗi. Sửa bài nhiều lần liên tiếp chỉ gửi một lần (chống trùng theo đường dẫn, chờ 10 giây).
    /// </summary>
    private static async Task QueueAsync(IServiceProvider services, PostDto post)
    {
        var s = await SeoSettings.LoadAsync(services.GetRequiredService<IOptionStore>(), CancellationToken.None);
        if (!SeoSettings.Bool(s["modules"]?["indexNow"], true) || !SeoSettings.Bool(s["indexNow"]?["autoSubmit"], true)) return;
        if (!SeoSettings.Strings(s["indexNow"]?["postTypes"]).Contains(post.Type)) return;
        if (SeoSettings.Bool(post.Meta[SeoMeta.MetaKey]?["robots"]?["noindex"])) return;
        await services.GetRequiredService<IJobQueue>().EnqueueAsync(JobType, new IndexNowJob(post.Link),
            new JobOptions { DedupKey = $"{JobType}:{post.Link}", Delay = TimeSpan.FromSeconds(10) });
    }

    private static void RegisterJob(IPluginContext ctx) =>
        ctx.Jobs.Register<IndexNowJob>(JobType, async (job, jc) =>
        {
            var sp = jc.Services;
            var options = sp.GetRequiredService<IOptionStore>();
            var url = await SiteUrlAsync(options, jc.CancellationToken) + job.Link;
            var (status, message) = await SendAsync(sp.GetRequiredService<IHttpClientFactory>(), options, [url], jc.CancellationToken);
            await LogAsync(sp.GetRequiredService<IDbConnectionFactory>(), [url], status, message, "auto", jc.CancellationToken);
            // Máy tìm kiếm bận / lỗi máy chủ / mất kết nối → để hàng đợi thử lại (khoá sai, URL sai thì không thử lại)
            if (status == 429 || status >= 500 || message == ConnectFailed) throw new InvalidOperationException(message);
        }, new JobTypeOptions { MaxAttempts = 5, RetryDelay = TimeSpan.FromMinutes(1), Timeout = TimeSpan.FromSeconds(30), Label = Text.T("ecomcx-seo:indexNow.submit_urls_to_indexnow") });

    private static async Task<(int Status, string Message)> SendAsync(IHttpClientFactory http, IOptionStore options, List<string> urls, CancellationToken ct)
    {
        var site = await SiteUrlAsync(options, ct);
        if (!Uri.TryCreate(site, UriKind.Absolute, out var u)) return (0, Text.T("ecomcx-seo:indexNow.the_site_address_settings_general"));
        if (u.IsLoopback || u.Host.EndsWith(".local") || u.Host.EndsWith(".localhost"))
            return (0, Text.T("ecomcx-seo:indexNow.skipped_the_site_runs_on"));
        var key = await EnsureKeyAsync(options, ct);
        var client = http.CreateClient("ecx-seo");
        client.Timeout = TimeSpan.FromSeconds(15);
        try
        {
            var res = await client.PostAsJsonAsync(Endpoint, new { host = u.Host, key, keyLocation = site + KeyPath, urlList = urls }, ct);
            var message = (int)res.StatusCode switch
            {
                200 => Text.T("ecomcx-seo:indexNow.submitted_accepted_by_search_engines"),
                202 => Text.T("ecomcx-seo:indexNow.received_waiting_for_key_verification"),
                400 => Text.T("ecomcx-seo:indexNow.bad_request"),
                403 => Text.T("ecomcx-seo:indexNow.invalid_key_or_search_engines"),
                422 => Text.T("ecomcx-seo:indexNow.urls_don_t_belong_to"),
                429 => Text.T("ecomcx-seo:indexNow.too_many_requests_try_again"),
                _ => $"HTTP {(int)res.StatusCode}",
            };
            return ((int)res.StatusCode, message);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { return (0, ConnectFailed); }
    }

    private static async Task LogAsync(IDbConnectionFactory db, List<string> urls, int status, string message, string source, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(ct);
        await Db.ExecAsync(conn, $"insert into {Table} (urls, status, message, source) values (@u::jsonb, @s, @m, @src)", ct,
            ("u", JsonSerializer.Serialize(urls)), ("s", status), ("m", message), ("src", source));
        await Db.ExecAsync(conn, $"delete from {Table} where id in (select id from {Table} order by id desc offset 500)", ct);
    }

    public static async Task<string> SiteUrlAsync(IOptionStore options, CancellationToken ct) =>
        ((await options.GetAsync("site_url", ct))?.ToString() ?? "").TrimEnd('/');

    private static async Task<string> EnsureKeyAsync(IOptionStore options, CancellationToken ct)
    {
        var s = await SeoSettings.LoadAsync(options, ct);
        var key = SeoSettings.Str(s["indexNow"]?["key"]);
        if (key.Length >= 8) return key;
        key = NewKey();
        s["indexNow"]!["key"] = key;
        await options.SetAsync(SeoSettings.OptionKey, s, autoload: true, ct: ct);
        return key;
    }

    private static string NewKey() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));
}
