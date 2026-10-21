using System.Text.Json;
using System.Text.RegularExpressions;
using Cms.Plugin.Sdk;
using Cms.Plugin.Sdk.Contracts;
using Cms.Plugin.Sdk.Hooks;
using Cms.Plugin.Sdk.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

using Cms.Plugin.Sdk.Localization;
namespace EcomcxSeo;

public sealed record NotFoundRow(long Id, string Uri, long Hits, string? Referer, string? UserAgent, string? Ip, DateTimeOffset FirstSeen, DateTimeOffset LastSeen);
public sealed record NotFoundRedirectInput(List<long> Ids, string Target, int Type = 301);

/// <summary>Theo dõi 404: website báo đường dẫn không tồn tại (core action resolve.notfound) → ghi nhận để sửa link hỏng / tạo chuyển hướng.</summary>
public static class Monitor404
{
    public const string Table = "ecx_seo_404";
    private static int _inserts;

    public static void Register(IPluginContext ctx)
    {
        ctx.Migrations.Add("002_404", $"""
            create table if not exists {Table} (
                id bigserial primary key,
                uri text not null unique,
                hits bigint not null default 1,
                referer text,
                user_agent text,
                ip text,
                first_seen timestamptz not null default now(),
                last_seen timestamptz not null default now()
            );
            create index if not exists ix_{Table}_last on {Table} (last_seen desc);
            """, $"drop table if exists {Table}");

        ctx.Hooks.On<NotFoundEvent>(HookNames.NotFound, async (e, h) =>
        {
            var s = await SeoSettings.LoadAsync(h.Services.GetRequiredService<IOptionStore>(), h.CancellationToken);
            if (!SeoSettings.Bool(s["modules"]?["monitor404"], true)) return;
            var cfg = s["monitor404"]!;
            var uri = SeoSettings.Bool(cfg["ignoreQuery"], true) ? e.Path.Split('?')[0] : e.Path;
            if (uri.Length > 1000 || Ignored(uri, SeoSettings.Strings(cfg["ignore"]))) return;
            var db = h.Services.GetRequiredService<IDbConnectionFactory>();
            if (await Redirects.IsGoneAsync(db, uri, h.CancellationToken)) return; // 410/451 là chủ ý, không phải link hỏng
            var advanced = SeoSettings.Str(cfg["mode"], "simple") == "advanced";
            await using var conn = await db.OpenAsync(h.CancellationToken);
            await Db.ExecAsync(conn, $"""
                insert into {Table} (uri, referer, user_agent, ip) values (@u, @r, @ua, @ip)
                on conflict (uri) do update set hits = {Table}.hits + 1, last_seen = now(),
                    referer = coalesce(excluded.referer, {Table}.referer), user_agent = coalesce(excluded.user_agent, {Table}.user_agent), ip = coalesce(excluded.ip, {Table}.ip)
                """, h.CancellationToken, ("u", uri), ("r", e.Referer), ("ua", advanced ? e.UserAgent : null), ("ip", advanced ? e.Ip : null));
            // Giữ tối đa "limit" dòng (xoá dòng cũ nhất) — kiểm tra định kỳ để không tốn truy vấn mỗi lần
            if (Interlocked.Increment(ref _inserts) % 50 == 0)
            {
                var limit = Math.Clamp(SeoSettings.Int(cfg["limit"], 1000), 100, 100_000);
                await Db.ExecAsync(conn, $"delete from {Table} where id in (select id from {Table} order by last_seen desc offset @l)", h.CancellationToken, ("l", limit));
            }
        });

        ctx.Endpoints.Map(r =>
        {
            r.MapGet("/404", async (string? search, string? sort, int? page, IDbConnectionFactory db, CancellationToken ct) =>
            {
                var p = Math.Max(1, page ?? 1);
                var order = sort == "hits" ? "hits desc, last_seen desc" : "last_seen desc";
                await using var conn = await db.OpenAsync(ct);
                var args = new (string, object?)[] { ("q", search ?? ""), ("like", $"%{search}%") };
                var where = "where (@q = '' or uri ilike @like or coalesce(referer,'') ilike @like)";
                var total = await Db.ScalarAsync<long>(conn, $"select count(*) from {Table} {where}", ct, args);
                var hits = await Db.ScalarAsync<long?>(conn, $"select sum(hits) from {Table}", ct) ?? 0;
                var today = await Db.ScalarAsync<long>(conn, $"select count(*) from {Table} where last_seen > now() - interval '1 day'", ct);
                var items = await Db.QueryAsync(conn, $"select id, uri, hits, referer, user_agent, ip, first_seen, last_seen from {Table} {where} order by {order} limit 50 offset @o",
                    r => new NotFoundRow(r.GetInt64(0), r.GetString(1), r.GetInt64(2), r.Str(3), r.Str(4), r.Str(5), r.GetFieldValue<DateTimeOffset>(6), r.GetFieldValue<DateTimeOffset>(7)),
                    ct, [.. args, ("o", (p - 1) * 50)]);
                return Results.Ok(new { items, total, hits, today, page = p, totalPages = (int)Math.Ceiling(total / 50.0) });
            }).RequireCapability(Caps.Monitor404);

            r.MapPost("/404/delete", async (BulkInput input, IDbConnectionFactory db, CancellationToken ct) =>
            {
                await using var conn = await db.OpenAsync(ct);
                var n = await Db.ExecAsync(conn, $"delete from {Table} where id = any(@ids)", ct, ("ids", input.Ids.Take(1000).ToArray()));
                return Results.Ok(new { affected = n });
            }).RequireCapability(Caps.Monitor404);

            r.MapPost("/404/clear", async (IDbConnectionFactory db, CancellationToken ct) =>
            {
                await using var conn = await db.OpenAsync(ct);
                await Db.ExecAsync(conn, $"truncate {Table}", ct);
                return Results.NoContent();
            }).RequireCapability(Caps.Monitor404);

            // Tạo một quy tắc chuyển hướng gom các URL 404 đã chọn, rồi xoá chúng khỏi danh sách
            r.MapPost("/404/redirect", async (NotFoundRedirectInput input, IDbConnectionFactory db, IHookBus hooks, CancellationToken ct) =>
            {
                if (!Redirects.Types.Contains(input.Type)) return Results.BadRequest();
                await using var conn = await db.OpenAsync(ct);
                var uris = await Db.QueryAsync(conn, $"select uri from {Table} where id = any(@ids)", r => r.GetString(0), ct, ("ids", input.Ids.Take(500).ToArray()));
                if (uris.Count == 0) return Results.NotFound();
                var target = input.Target?.Trim() ?? "";
                if (input.Type is not (410 or 451) && !target.StartsWith('/') && !Uri.TryCreate(target, UriKind.Absolute, out _))
                    return Results.Json(new { title = Text.T("ecomcx-seo:monitor404.invalid_data"), errors = new { target = new[] { Text.T("ecomcx-seo:monitor404.the_target_must_be_a") } } }, statusCode: 422);
                var sources = uris.Where(u => Redirects.Normalize(u) != Redirects.Normalize(target)).Select(u => new RedirectSource(Redirects.Normalize(u))).ToList();
                if (sources.Count == 0) return Results.Json(new { title = Text.T("ecomcx-seo:monitor404.source_and_target_are_the") }, statusCode: 422);
                var id = await Db.ScalarAsync<long>(conn, $"insert into {Redirects.Table} (sources, target, type, notes) values (@s::jsonb, @t, @ty, @n) returning id", ct,
                    ("s", JsonSerializer.Serialize(sources, SeoSettings.Json)), ("t", target), ("ty", input.Type), ("n", Text.T("ecomcx-seo:monitor404.created_from_404_monitor")));
                await Db.ExecAsync(conn, $"delete from {Table} where id = any(@ids)", ct, ("ids", input.Ids.Take(500).ToArray()));
                await Redirects.ChangedAsync(hooks, ct);
                return Results.Ok(new { id, sources = sources.Count });
            }).RequireCapability(Caps.Monitor404);
        });
    }

    /// <summary>Mẫu bỏ qua: chứa chuỗi, hoặc "re:" + biểu thức chính quy (vd re:^/old-).</summary>
    private static bool Ignored(string uri, IEnumerable<string> patterns)
    {
        foreach (var p in patterns)
        {
            if (p.StartsWith("re:"))
            {
                try { if (Regex.IsMatch(uri, p[3..], RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(50))) return true; }
                catch (Exception e) when (e is ArgumentException or RegexMatchTimeoutException) { /* mẫu sai → bỏ qua mẫu */ }
            }
            else if (uri.Contains(p, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }
}
