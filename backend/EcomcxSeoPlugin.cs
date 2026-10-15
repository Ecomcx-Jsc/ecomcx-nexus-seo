using System.Text.Json.Nodes;
using Cms.Plugin.Sdk;
using Cms.Plugin.Sdk.Contracts;
using Cms.Plugin.Sdk.Hooks;
using Cms.Plugin.Sdk.Registry;
using Cms.Plugin.Sdk.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace EcomcxSeo;

/// <summary>Quyền của Ecomcx SEO (gán sẵn cho vai trò; đổi ở Thành viên › Vai trò).</summary>
public static class Caps
{
    /// <summary>Cài đặt chung, tiêu đề & meta, sitemap, schema, IndexNow.</summary>
    public const string Settings = "ecx_seo_settings";
    public const string Redirects = "ecx_seo_redirects";
    public const string Monitor404 = "ecx_seo_404";
    /// <summary>Phân tích website / đối thủ, Search Console.</summary>
    public const string Analysis = "ecx_seo_analysis";
    /// <summary>Hộp SEO trong trình soạn, sửa hàng loạt.</summary>
    public const string Edit = "ecx_seo_edit";
}

/// <summary>
/// Ecomcx SEO — tối ưu tìm kiếm toàn diện: tiêu đề & meta theo mẫu, phân tích nội dung, schema JSON-LD, sitemap (thường, tin tức, video),
/// chuyển hướng, theo dõi 404, breadcrumbs, SEO hình ảnh, IndexNow, Search Console, phân tích website và đối thủ.
/// </summary>
public sealed class EcomcxSeoPlugin : CmsPlugin
{
    public const string Slug = "ecomcx-seo";
    private const string LegacyWhere = "meta ?| array['_seo_title', '_seo_description', '_seo_noindex']";
    private const string LegacyRedirectWhere = $"not exists (select 1 from {Redirects.Table} r where r.sources @> jsonb_build_array(jsonb_build_object('pattern', o.source)))";

    /// <summary>Gỡ kèm xoá dữ liệu: bảng được core xoá theo migration; ở đây dọn các option của plugin.</summary>
    public override async Task OnUninstallAsync(PluginLifecycleContext ctx)
    {
        using var scope = ctx.Services.CreateScope();
        var options = scope.ServiceProvider.GetRequiredService<IOptionStore>();
        foreach (var key in new[] { SeoSettings.OptionKey, "ecx_seo_last_audit" }) await options.DeleteAsync(key, ctx.CancellationToken);
    }

    public override void Register(IPluginContext ctx)
    {
        ctx.Capabilities.Add(Caps.Settings, "administrator");
        ctx.Capabilities.Add(Caps.Redirects, "administrator", "editor");
        ctx.Capabilities.Add(Caps.Monitor404, "administrator", "editor");
        ctx.Capabilities.Add(Caps.Analysis, "administrator", "editor");
        ctx.Capabilities.Add(Caps.Edit, "administrator", "editor", "author");

        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo", "SEO", "/ecx-seo", Caps.Edit, "search", 68));
        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo-dashboard", "Bảng điều khiển", "/ecx-seo", Caps.Edit, "search", 1, "ecx-seo"));
        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo-titles", "Tiêu đề & Meta", "/ecx-seo/titles", Caps.Settings, "search", 2, "ecx-seo"));
        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo-settings", "Cài đặt chung", "/ecx-seo/settings", Caps.Settings, "search", 3, "ecx-seo"));
        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo-sitemap", "Sitemap", "/ecx-seo/sitemap", Caps.Settings, "search", 4, "ecx-seo"));
        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo-schema", "Schema", "/ecx-seo/schema", Caps.Settings, "search", 5, "ecx-seo"));
        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo-redirects", "Chuyển hướng", "/ecx-seo/redirects", Caps.Redirects, "search", 6, "ecx-seo"));
        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo-404", "Theo dõi 404", "/ecx-seo/404", Caps.Monitor404, "search", 7, "ecx-seo"));
        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo-analysis", "Phân tích", "/ecx-seo/analysis", Caps.Analysis, "search", 8, "ecx-seo"));
        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo-bulk", "Sửa hàng loạt", "/ecx-seo/bulk", Caps.Edit, "search", 9, "ecx-seo"));
        ctx.Admin.AddMenu(new AdminMenuItem("ecx-seo-tools", "Công cụ", "/ecx-seo/tools", Caps.Settings, "search", 10, "ecx-seo"));

        SeoMeta.Register(ctx);
        Redirects.Register(ctx);
        Monitor404.Register(ctx);
        Sitemaps.Register(ctx);
        IndexNow.Register(ctx);
        Analysis.Register(ctx);
        SearchConsole.Register(ctx);

        ctx.Endpoints.Map(r =>
        {
            r.MapGet("/settings", async (IOptionStore options, CancellationToken ct) =>
                Results.Ok(SeoSettings.ForAdmin(await SeoSettings.LoadAsync(options, ct)))).RequireCapability(Caps.Edit);

            r.MapPut("/settings", async (JsonObject input, IOptionStore options, IHookBus hooks, CancellationToken ct) =>
            {
                var saved = await SeoSettings.SaveAsync(options, input, ct);
                await ContentChangedAsync(hooks, ct);
                return Results.Ok(SeoSettings.ForAdmin(saved));
            }).RequireCapability(Caps.Settings);

            // Xuất / nhập cài đặt (không gồm secret) — chuyển cấu hình giữa các website
            r.MapGet("/settings/export", async (IOptionStore options, CancellationToken ct) =>
            {
                var s = SeoSettings.ForAdmin(await SeoSettings.LoadAsync(options, ct));
                (s["analytics"] as JsonObject)?.Remove("serviceAccount");
                (s["indexNow"] as JsonObject)?.Remove("key");
                return Results.Ok(new JsonObject { ["plugin"] = Slug, ["exportedAt"] = DateTimeOffset.UtcNow, ["settings"] = s });
            }).RequireCapability(Caps.Settings);

            r.MapPost("/settings/import", async (JsonObject input, IOptionStore options, IHookBus hooks, CancellationToken ct) =>
            {
                if (input["settings"] is not JsonObject incoming) return Results.Json(new { title = "File không đúng định dạng cài đặt Ecomcx SEO" }, statusCode: 422);
                var current = await SeoSettings.LoadAsync(options, ct);
                // Giữ secret và khoá IndexNow của website này
                incoming.Remove("analytics");
                (incoming["indexNow"] as JsonObject)?.Remove("key");
                SeoSettings.Merge(current, incoming);
                var saved = await SeoSettings.SaveAsync(options, (JsonObject)SeoSettings.ForAdmin(current), ct);
                await ContentChangedAsync(hooks, ct);
                return Results.Ok(SeoSettings.ForAdmin(saved));
            }).RequireCapability(Caps.Settings);

            r.MapPost("/settings/reset", async (IOptionStore options, IHookBus hooks, CancellationToken ct) =>
            {
                var current = await SeoSettings.LoadAsync(options, ct);
                var fresh = SeoSettings.Defaults();
                fresh["indexNow"]!["key"] = current["indexNow"]?["key"]?.DeepClone();
                await options.SetAsync(SeoSettings.OptionKey, fresh, autoload: true, ct: ct);
                await ContentChangedAsync(hooks, ct);
                return Results.Ok(SeoSettings.ForAdmin(fresh));
            }).RequireCapability(Caps.Settings);

            // Dữ liệu của plugin SEO Toolkit (meta _seo_title/_seo_description/_seo_noindex) → _ecx_seo; giá trị đã có ở _ecx_seo được giữ nguyên
            r.MapGet("/tools/legacy", async (IDbConnectionFactory db, CancellationToken ct) =>
            {
                await using var conn = await db.OpenAsync(ct);
                return Results.Ok(new { count = await Db.ScalarAsync<long>(conn, $"select count(*) from posts where {LegacyWhere}", ct) });
            }).RequireCapability(Caps.Settings);

            r.MapPost("/tools/legacy", async (IDbConnectionFactory db, IHookBus hooks, CancellationToken ct) =>
            {
                await using var conn = await db.OpenAsync(ct);
                var n = await Db.ExecAsync(conn, $$"""
                    update posts set meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{{{SeoMeta.MetaKey}}}',
                        jsonb_strip_nulls(jsonb_build_object(
                            'title', nullif(meta->>'_seo_title', ''),
                            'description', nullif(meta->>'_seo_description', ''),
                            'robots', case when meta->>'_seo_noindex' = 'true' then jsonb_build_object('noindex', true) end))
                        || coalesce(meta->'{{SeoMeta.MetaKey}}', '{}'::jsonb))
                    where {{LegacyWhere}}
                    """, ct);
                await ContentChangedAsync(hooks, ct);
                return Results.Ok(new { affected = n });
            }).RequireCapability(Caps.Settings);

            // Quy tắc của plugin Chuyển hướng (bảng plugin_redirects) chưa có ở Ecomcx SEO
            r.MapGet("/tools/legacy-redirects", async (IDbConnectionFactory db, CancellationToken ct) =>
            {
                await using var conn = await db.OpenAsync(ct);
                if (await Db.ScalarAsync<string?>(conn, "select to_regclass('plugin_redirects')::text", ct) is null) return Results.Ok(new { count = 0L });
                return Results.Ok(new { count = await Db.ScalarAsync<long>(conn, $"select count(*) from plugin_redirects o where {LegacyRedirectWhere}", ct) });
            }).RequireCapability(Caps.Settings);

            r.MapPost("/tools/legacy-redirects", async (IDbConnectionFactory db, IHookBus hooks, CancellationToken ct) =>
            {
                await using var conn = await db.OpenAsync(ct);
                if (await Db.ScalarAsync<string?>(conn, "select to_regclass('plugin_redirects')::text", ct) is null) return Results.Ok(new { affected = 0 });
                var n = await Db.ExecAsync(conn, $"""
                    insert into {Redirects.Table} (sources, target, type, hits, is_auto, notes, created_at, last_accessed_at)
                    select jsonb_build_array(jsonb_build_object('pattern', o.source, 'comparison', 'exact', 'ignoreCase', true)),
                           o.target, case when o.status_code in (301, 302, 307, 410, 451) then o.status_code else 301 end,
                           o.hits, o.is_auto, 'Chuyển từ plugin Chuyển hướng', o.created_at, o.last_hit_at
                    from plugin_redirects o where {LegacyRedirectWhere}
                    """, ct);
                await Redirects.ChangedAsync(hooks, ct);
                return Results.Ok(new { affected = n });
            }).RequireCapability(Caps.Settings);

            // Từ khoá chính đã được bài khác dùng chưa (tránh các bài tự cạnh tranh nhau)
            r.MapGet("/keyword-check", async (string kw, long? exclude, IDbConnectionFactory db, CancellationToken ct) =>
            {
                var k = (kw ?? "").Trim().ToLowerInvariant();
                if (k.Length == 0 || k.Length > 200) return Results.Ok(new { used = false, posts = Array.Empty<object>() });
                await using var conn = await db.OpenAsync(ct);
                var posts = await Db.QueryAsync(conn, $"""
                    select id, title, type from posts
                    where id <> @ex and status in ('publish', 'draft', 'pending', 'scheduled', 'private')
                      and lower(meta->'{SeoMeta.MetaKey}'->'focusKeywords'->>0) = @k
                    order by updated_at desc limit 5
                    """, r => new { id = r.GetInt64(0), title = r.GetString(1), type = r.GetString(2) }, ct, ("ex", exclude ?? 0), ("k", k));
                return Results.Ok(new { used = posts.Count > 0, posts });
            }).RequireCapability(Caps.Edit);

            // Số liệu cho bảng điều khiển và widget bảng tin
            r.MapGet("/dashboard", async (IDbConnectionFactory db, IOptionStore options, CancellationToken ct) =>
            {
                await using var conn = await db.OpenAsync(ct);
                var posts = await Db.QueryAsync(conn, $"""
                    select (meta->'{SeoMeta.MetaKey}'->>'score')::int, coalesce(meta->'{SeoMeta.MetaKey}'->>'description', '') = '' and excerpt = '',
                           jsonb_array_length(coalesce(meta->'{SeoMeta.MetaKey}'->'focusKeywords', '[]'::jsonb)) = 0
                    from posts where status = 'publish' and type in ('post', 'page')
                    """, r => (Score: r.IsDBNull(0) ? (int?)null : r.GetInt32(0), NoDesc: r.GetBoolean(1), NoKw: r.GetBoolean(2)), ct);
                var redirects = await Db.QueryAsync(conn, $"select count(*), coalesce(sum(hits), 0) from {Redirects.Table} where status = 'active'", r => (Count: r.GetInt64(0), Hits: r.GetInt64(1)), ct);
                var notFound = await Db.QueryAsync(conn, $"select count(*), coalesce(sum(hits), 0), count(*) filter (where last_seen > now() - interval '7 days') from {Monitor404.Table}",
                    r => (Count: r.GetInt64(0), Hits: r.GetInt64(1), Week: r.GetInt64(2)), ct);
                var audit = await options.GetAsync("ecx_seo_last_audit", ct);
                return Results.Ok(new
                {
                    posts = new
                    {
                        total = posts.Count,
                        good = posts.Count(p => p.Score >= 80), ok = posts.Count(p => p.Score is >= 50 and < 80), bad = posts.Count(p => p.Score < 50),
                        unscored = posts.Count(p => p.Score is null), noDescription = posts.Count(p => p.NoDesc), noKeyword = posts.Count(p => p.NoKw),
                    },
                    redirects = new { count = redirects[0].Count, hits = redirects[0].Hits },
                    notFound = new { count = notFound[0].Count, hits = notFound[0].Hits, lastWeek = notFound[0].Week },
                    audit = audit is JsonObject a ? new { score = a["score"]?.GetValue<int>(), at = a["at"]?.ToString() } : null,
                });
            }).RequireCapability(Caps.Edit);
        });
    }

    /// <summary>Cài đặt SEO ảnh hưởng mọi trang → xoá cache API + website.</summary>
    private static Task ContentChangedAsync(IHookBus hooks, CancellationToken ct) =>
        hooks.DoAsync(HookNames.ContentChanged, new ContentChangedEvent(["site", "posts", "terms", "menus"]), ct);
}
