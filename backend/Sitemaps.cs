using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cms.Plugin.Sdk;
using Cms.Plugin.Sdk.Contracts;
using Cms.Plugin.Sdk.Hooks;
using Cms.Plugin.Sdk.Services;
using Microsoft.Extensions.DependencyInjection;

namespace EcomcxSeo;

/// <summary>
/// sitemap.xml: bỏ loại nội dung/phân loại đã tắt, ID loại trừ, trang noindex hoặc có canonical trỏ đi nơi khác;
/// thêm ảnh trong nội dung bài (Google Images). Sitemap tin tức/video/llms.txt dựng ở phần website (route gốc của plugin).
/// </summary>
public static partial class Sitemaps
{
    public static void Register(IPluginContext ctx)
    {
        ctx.Filters.Add<List<SitemapEntryDto>>(FilterNames.ApiSitemapResponse, async (entries, h) =>
        {
            var s = await SeoSettings.LoadAsync(h.Services.GetRequiredService<IOptionStore>(), h.CancellationToken);
            if (!SeoSettings.Bool(s["modules"]?["sitemap"], true)) return entries;
            var excludePosts = SeoSettings.Longs(s["sitemap"]?["excludePosts"]).ToHashSet();
            var excludeTerms = SeoSettings.Longs(s["sitemap"]?["excludeTerms"]).ToHashSet();
            var includeImages = SeoSettings.Bool(s["sitemap"]?["includeImages"], true);

            entries = entries.Where(e => e.PostId is { } pid
                ? SeoSettings.SitemapIncludes(s, e.Type, false) && !SeoSettings.TypeNoindex(s, e.Type, false) && !excludePosts.Contains(pid)
                : e.TermId is not { } tid || (SeoSettings.SitemapIncludes(s, e.Type, true) && !SeoSettings.TypeNoindex(s, e.Type, true) && !excludeTerms.Contains(tid))).ToList();

            var db = h.Services.GetRequiredService<IDbConnectionFactory>();
            await using var conn = await db.OpenAsync(h.CancellationToken);
            var postIds = entries.Where(e => e.PostId.HasValue).Select(e => e.PostId!.Value).ToArray();
            var posts = await Db.QueryAsync(conn, $"select id, meta->'{SeoMeta.MetaKey}', {(includeImages ? "content" : "null")} from posts where id = any(@ids)",
                r => (Id: r.GetInt64(0), Seo: r.IsDBNull(1) ? null : JsonNode.Parse(r.GetString(1)), Content: r.IsDBNull(2) ? null : r.GetString(2)), h.CancellationToken, ("ids", postIds));
            var termIds = entries.Where(e => e.TermId.HasValue).Select(e => e.TermId!.Value).ToArray();
            var terms = await Db.QueryAsync(conn, $"select id, meta->'{SeoMeta.MetaKey}' from terms where id = any(@ids)",
                r => (Id: r.GetInt64(0), Seo: r.IsDBNull(1) ? null : JsonNode.Parse(r.GetString(1))), h.CancellationToken, ("ids", termIds));
            var postMap = posts.ToDictionary(p => p.Id);
            var termMap = terms.ToDictionary(t => t.Id);

            var result = new List<SitemapEntryDto>(entries.Count);
            foreach (var e in entries)
            {
                var seo = e.PostId is { } pid && postMap.TryGetValue(pid, out var p) ? p.Seo : e.TermId is { } tid && termMap.TryGetValue(tid, out var t) ? t.Seo : null;
                if (Excluded(seo, e.Loc)) continue;
                if (includeImages && e.PostId is { } id && postMap.TryGetValue(id, out var post) && post.Content is not null)
                    foreach (var img in ImagesIn(post.Content)) if (!e.Images.Contains(img) && e.Images.Count < 1000) e.Images.Add(img);
                if (!includeImages) e.Images.Clear();
                result.Add(e);
            }
            return result;
        }, priority: 20);
    }

    /// <summary>Trang noindex hoặc canonical trỏ sang URL khác → không đưa vào sitemap.</summary>
    private static bool Excluded(JsonNode? seo, string loc)
    {
        if (seo is not JsonObject o) return false;
        if (SeoSettings.Bool(o["robots"]?["noindex"])) return true;
        var canonical = SeoSettings.Str(o["canonical"]).Trim();
        if (canonical.Length == 0) return false;
        var path = Uri.TryCreate(canonical, UriKind.Absolute, out var u) ? u.AbsolutePath : canonical;
        return !string.Equals(path.TrimEnd('/'), loc.TrimEnd('/'), StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>URL ảnh trong nội dung khối (ảnh, bộ sưu tập, HTML).</summary>
    public static IEnumerable<string> ImagesIn(string contentJson)
    {
        JsonNode? root;
        try { root = JsonNode.Parse(contentJson); } catch { yield break; }
        var found = new List<string>();
        Walk(root, found);
        foreach (var f in found.Distinct()) yield return f;
    }

    private static void Walk(JsonNode? n, List<string> found)
    {
        switch (n)
        {
            case JsonObject o:
                var type = SeoSettings.Str(o["type"]);
                if (type == "image" && SeoSettings.Str(o["attrs"]?["src"]) is { Length: > 0 } src) found.Add(src);
                if (type == "gallery" && o["attrs"]?["images"] is JsonArray imgs)
                    foreach (var im in imgs) if (SeoSettings.Str(im?["src"]) is { Length: > 0 } gs) found.Add(gs);
                if (type == "html" && SeoSettings.Str(o["data"]?["html"]) is { Length: > 0 } html)
                    foreach (Match m in ImgSrc().Matches(html)) found.Add(m.Groups[1].Value);
                foreach (var (_, v) in o) Walk(v, found);
                break;
            case JsonArray a:
                foreach (var v in a) Walk(v, found);
                break;
        }
    }

    [GeneratedRegex("""<img[^>]+src=["']([^"']+)["']""", RegexOptions.IgnoreCase)] private static partial Regex ImgSrc();
}
