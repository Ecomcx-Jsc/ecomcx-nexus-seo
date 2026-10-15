using System.Text.Json;
using System.Text.Json.Nodes;
using Cms.Plugin.Sdk.Services;

namespace EcomcxSeo;

/// <summary>
/// Cài đặt của Ecomcx SEO: một đối tượng JSON lưu trong option "ecx_seo".
/// Giá trị mặc định được gộp với giá trị đã lưu (đối tượng gộp sâu, mảng thay thế) → thêm tuỳ chọn mới không cần migration.
/// </summary>
public static class SeoSettings
{
    public const string OptionKey = "ecx_seo";
    public const string SecretMask = "********";

    /// <summary>Đường dẫn các giá trị bí mật (không trả nguyên văn về trình duyệt, không đưa ra website).</summary>
    private static readonly string[][] Secrets = [["analytics", "serviceAccount"]];

    public static JsonObject Defaults() => (JsonNode.Parse("""
    {
      "modules": {
        "redirections": true, "monitor404": true, "sitemap": true, "schema": true, "breadcrumbs": true, "imageSeo": true,
        "indexNow": true, "localSeo": false, "newsSitemap": false, "videoSitemap": false, "analytics": false, "linkCounter": true, "llmsTxt": false
      },
      "general": {
        "separator": "-", "capitalizeTitles": false,
        "noindexEmptyTerms": true, "noindexPaginated": false, "noindexSearch": true, "noindexPasswordProtected": true, "noindexArchiveSubpages": false,
        "robots": { "noindex": false, "nofollow": false, "noarchive": false, "nosnippet": false, "noimageindex": false },
        "advancedRobots": { "maxSnippet": -1, "maxImagePreview": "large", "maxVideoPreview": -1 },
        "nofollowExternal": false, "nofollowImageLinks": false, "externalNewTab": true, "nofollowExcludeDomains": [], "nofollowDomains": []
      },
      "titles": {
        "home": { "title": "%sitename% %sep% %sitedesc%", "description": "", "ogTitle": "", "ogDescription": "", "ogImage": null, "robots": null },
        "postTypes": {},
        "taxonomies": {},
        "author": { "title": "%name% %sep% %sitename%", "description": "%user_description%", "noindex": false, "disabled": false },
        "date": { "title": "%date% %sep% %sitename%", "description": "", "noindex": true, "disabled": false },
        "search": { "title": "%search_query% %sep% %page% %sep% %sitename%" },
        "notFound": { "title": "%404_title% %sep% %sitename%" }
      },
      "social": {
        "facebookUrl": "", "twitterUsername": "", "profiles": [], "ogImage": null,
        "facebookAppId": "", "facebookAdminId": "", "twitterCard": "summary_large_image", "slackEnhanced": true
      },
      "knowledgeGraph": {
        "type": "organization", "name": "", "alternateName": "", "logo": null, "url": "", "description": "", "email": "", "phone": "",
        "businessType": "Organization", "address": { "street": "", "locality": "", "region": "", "postalCode": "", "country": "VN" },
        "geo": { "lat": "", "lng": "" }, "openingHours": [], "priceRange": "", "foundingDate": ""
      },
      "webmaster": { "google": "", "bing": "", "baidu": "", "yandex": "", "pinterest": "", "norton": "", "custom": "" },
      "analytics": { "ga4": "", "gtm": "", "serviceAccount": "", "searchConsoleProperty": "" },
      "sitemap": {
        "includeImages": true, "excludePosts": [], "excludeTerms": [], "postTypes": {}, "taxonomies": { "post_tag": false },
        "news": { "postTypes": ["post"], "publicationName": "", "excludeTerms": [] },
        "video": { "postTypes": ["post", "page"] }
      },
      "breadcrumbs": {
        "separator": "»", "showHome": true, "homeLabel": "", "prefix": "", "archiveFormat": "", "searchFormat": "",
        "notFoundLabel": "", "showAncestors": true, "hideTaxonomyName": false, "showPostTitle": true
      },
      "imageSeo": { "addMissingAlt": true, "altFormat": "%filename%", "addMissingTitle": true, "titleFormat": "%title% %count(title)%", "onUpload": true, "caseChange": "none" },
      "redirections": { "autoOnSlugChange": true, "defaultType": 301, "keepQuery": true },
      "monitor404": { "mode": "simple", "limit": 1000, "ignore": [], "ignoreQuery": true },
      "robotsTxt": { "custom": false, "content": "" },
      "llmsTxt": { "postTypes": ["post", "page"], "limit": 50, "extra": "" },
      "indexNow": { "key": "", "postTypes": ["post", "page"], "autoSubmit": true },
      "schema": { "templates": [] }
    }
    """) as JsonObject)!;

    public static async Task<JsonObject> LoadAsync(IOptionStore options, CancellationToken ct)
    {
        var stored = await options.GetAsync(OptionKey, ct) as JsonObject;
        var s = Defaults();
        if (stored is not null) Merge(s, stored);
        return s;
    }

    /// <summary>Lưu từ trình duyệt: giữ secret cũ khi gửi lại giá trị che, chỉ nhận các nhánh có trong mặc định.</summary>
    public static async Task<JsonObject> SaveAsync(IOptionStore options, JsonObject input, CancellationToken ct)
    {
        var current = await LoadAsync(options, ct);
        foreach (var path in Secrets)
            if (Get(input, path)?.ToString() == SecretMask) Set(input, path, Get(current, path)?.DeepClone());
        // Gộp vào cài đặt hiện tại: gửi thiếu nhánh hoặc sai kiểu không làm mất cấu hình đang có
        Merge(current, Prune(input, Defaults()));
        await options.SetAsync(OptionKey, current, autoload: true, ct: ct);
        return current;
    }

    /// <summary>Bản gửi về admin: secret được che.</summary>
    public static JsonObject ForAdmin(JsonObject s)
    {
        var c = (JsonObject)s.DeepClone();
        foreach (var path in Secrets)
            if (Get(c, path)?.ToString() is { Length: > 0 }) Set(c, path, SecretMask);
        return c;
    }

    /// <summary>Bản đưa ra website (site.extra.ecxSeo): bỏ secret và phần chỉ dùng ở máy chủ.</summary>
    public static JsonObject ForPublic(JsonObject s)
    {
        var c = (JsonObject)s.DeepClone();
        foreach (var path in Secrets) (Get(c, path[..^1]) as JsonObject)?.Remove(path[^1]);
        (c["analytics"] as JsonObject)?.Remove("searchConsoleProperty");
        c.Remove("monitor404");
        c.Remove("redirections");
        return c;
    }

    // ------------------------------------------------------------------ JSON tiện ích

    /// <summary>Gộp sâu: đối tượng gộp từng khoá, giá trị khác (gồm mảng) thay thế.</summary>
    public static void Merge(JsonObject target, JsonObject source)
    {
        foreach (var (k, v) in source)
        {
            if (v is JsonObject so && target[k] is JsonObject to) Merge(to, so);
            else target[k] = v?.DeepClone();
        }
    }

    /// <summary>Chỉ giữ các khoá có trong mẫu ở cấp cố định; nhánh "tự do" (postTypes, taxonomies, templates…) giữ nguyên.</summary>
    private static JsonObject Prune(JsonObject input, JsonObject template)
    {
        var o = new JsonObject();
        foreach (var (k, v) in input)
        {
            if (!template.ContainsKey(k)) continue;
            var t = template[k];
            if (t is JsonObject tObj && v is JsonObject vObj)
                o[k] = tObj.Count == 0 ? vObj.DeepClone() : Prune(vObj, tObj);
            else if (t is JsonObject && v is not JsonObject) continue; // sai kiểu → bỏ
            else if (t is JsonArray && v is not JsonArray) continue;
            else if (t is JsonValue tv && (v is JsonObject or JsonArray || (v is JsonValue vv && Kind(tv) != Kind(vv)))) continue;
            else o[k] = v?.DeepClone();
        }
        return o;
    }

    /// <summary>Loại giá trị JSON (true/false gộp làm một).</summary>
    private static JsonValueKind Kind(JsonValue v) => v.GetValueKind() is JsonValueKind.False ? JsonValueKind.True : v.GetValueKind();

    private static JsonNode? Get(JsonObject o, string[] path)
    {
        JsonNode? n = o;
        foreach (var p in path) n = (n as JsonObject)?[p];
        return n;
    }

    private static void Set(JsonObject o, string[] path, JsonNode? value)
    {
        var parent = o;
        foreach (var p in path[..^1]) parent = parent[p] as JsonObject ?? (JsonObject)(parent[p] = new JsonObject());
        parent[path[^1]] = value;
    }

    public static bool Bool(JsonNode? n, bool fallback = false) => n is JsonValue v && v.TryGetValue<bool>(out var b) ? b : fallback;
    public static string Str(JsonNode? n, string fallback = "") => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : fallback;
    public static int Int(JsonNode? n, int fallback = 0) => n is JsonValue v && (v.TryGetValue<int>(out var i) || (v.TryGetValue<double>(out var d) && (i = (int)d) == i)) ? i : fallback;
    public static IEnumerable<string> Strings(JsonNode? n) => n is JsonArray a ? a.Select(x => x?.ToString() ?? "").Where(x => x.Length > 0) : [];
    public static IEnumerable<long> Longs(JsonNode? n) => n is JsonArray a ? a.Select(x => long.TryParse(x?.ToString(), out var l) ? l : 0).Where(x => x > 0) : [];

    /// <summary>Loại nội dung có bật trong sitemap không (mặc định: có).</summary>
    public static bool SitemapIncludes(JsonObject s, string type, bool isTaxonomy)
    {
        var map = s["sitemap"]?[isTaxonomy ? "taxonomies" : "postTypes"] as JsonObject;
        return map?[type] is JsonValue v && v.TryGetValue<bool>(out var b) ? b : true;
    }

    /// <summary>Loại nội dung bị noindex theo cài đặt chung (Tiêu đề & Meta).</summary>
    public static bool TypeNoindex(JsonObject s, string type, bool isTaxonomy) =>
        Bool(s["titles"]?[isTaxonomy ? "taxonomies" : "postTypes"]?[type]?["noindex"]);

    public static JsonSerializerOptions Json { get; } = new(JsonSerializerDefaults.Web);
}
