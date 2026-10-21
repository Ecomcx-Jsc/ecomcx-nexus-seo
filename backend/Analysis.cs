using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cms.Plugin.Sdk;
using Cms.Plugin.Sdk.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Cms.Plugin.Sdk.Localization;
namespace EcomcxSeo;

/// <summary>Message là mẫu tiếng Việt có {0}, {1}… (admin dịch rồi điền Args).</summary>
public sealed record AuditItem(string Id, string Group, string Title, string Status, string Message, List<AuditRef>? Items = null, List<string>? Args = null);
/// <summary>Bài liên quan tới một mục kiểm tra. Dùng "postId" (không phải "id") để core không nhầm là ảnh đang được dùng khi quét option.</summary>
public sealed record AuditRef(long PostId, string Title, string? Type = null);
public sealed record CompetitorInput(string Url);

/// <summary>Phân tích SEO: kiểm tra cấu hình + nội dung của website, và phân tích HTML một URL bất kỳ (đối thủ).</summary>
public static partial class Analysis
{
    public static void Register(IPluginContext ctx)
    {
        ctx.Endpoints.Map(r =>
        {
            r.MapPost("/analysis/site", async (IOptionStore options, IDbConnectionFactory db, IHttpClientFactory http, CancellationToken ct) =>
            {
                var items = new List<AuditItem>();
                var s = await SeoSettings.LoadAsync(options, ct);
                async Task<string> Opt(string k) => (await options.GetAsync(k, ct))?.ToString() ?? "";

                // ---------------------------------------------------------- Cơ bản
                var title = await Opt("site_title");
                items.Add(new("site-title", "basic", Text.T("ecomcx-seo:analysis.site_title"), title.Length >= 3 ? "pass" : "fail",
                    title.Length >= 3 ? Text.T("ecomcx-seo:analysis.site_title_2") : Text.T("ecomcx-seo:analysis.no_site_title_set_settings"), null, [title]));
                var tagline = await Opt("site_tagline");
                items.Add(new("tagline", "basic", Text.T("ecomcx-seo:analysis.tagline"), tagline.Length > 0 ? "pass" : "warning",
                    tagline.Length > 0 ? Text.T("ecomcx-seo:analysis.tagline_2") : Text.T("ecomcx-seo:analysis.no_tagline_it_s_used"), null, [tagline]));
                var indexable = (await options.GetAsync("blog_public", ct)) is not JsonValue bp || !bp.TryGetValue<bool>(out var b) || b;
                items.Add(new("indexable", "basic", Text.T("ecomcx-seo:analysis.search_engine_visibility"), indexable ? "pass" : "fail",
                    indexable ? Text.T("ecomcx-seo:analysis.the_site_allows_search_engines") : Text.T("ecomcx-seo:analysis.search_engines_are_discouraged_settings")));
                var siteUrl = await IndexNow.SiteUrlAsync(options, ct);
                var https = siteUrl.StartsWith("https://");
                items.Add(new("https", "basic", "HTTPS", https ? "pass" : "fail",
                    https ? Text.T("ecomcx-seo:analysis.the_site_uses_https") : Text.T("ecomcx-seo:analysis.the_site_address_doesn_t"), null, [siteUrl]));
                var structure = await Opt("permalink_structure") is { Length: > 0 } ps ? ps : "/%postname%";
                items.Add(new("permalink", "basic", Text.T("ecomcx-seo:analysis.permalinks"), structure.Contains("%postname%") ? "pass" : "warning",
                    structure.Contains("%postname%") ? Text.T("ecomcx-seo:analysis.the_permalink_structure_includes_the") : Text.T("ecomcx-seo:analysis.the_structure_doesn_t_include"), null, [structure]));

                // ---------------------------------------------------------- Nội dung
                await using var conn = await db.OpenAsync(ct);
                var posts = await Db.QueryAsync(conn, $"""
                    select id, type, title, excerpt, meta->'{SeoMeta.MetaKey}', content from posts
                    where status = 'publish' and type in ('post', 'page') order by updated_at desc limit 3000
                    """, r => (Id: r.GetInt64(0), Type: r.GetString(1), Title: r.GetString(2), Excerpt: r.GetString(3),
                        Seo: r.IsDBNull(4) ? null : JsonNode.Parse(r.GetString(4)), Content: r.IsDBNull(5) ? "" : r.GetString(5)), ct);
                AuditRef Ref((long Id, string Type, string Title, string Excerpt, JsonNode? Seo, string Content) p) => new(p.Id, p.Title, p.Type);

                var noDesc = posts.Where(p => SeoSettings.Str(p.Seo?["description"]).Length == 0 && p.Excerpt.Trim().Length == 0).ToList();
                items.Add(Count("meta-description", "content", Text.T("ecomcx-seo:analysis.seo_description"), noDesc.Select(Ref).ToList(), posts.Count,
                    Text.T("ecomcx-seo:analysis.every_post_has_an_seo"), Text.T("ecomcx-seo:analysis.posts_have_no_seo_description")));
                var noKw = posts.Where(p => !SeoSettings.Strings(p.Seo?["focusKeywords"]).Any()).ToList();
                items.Add(Count("focus-keyword", "content", Text.T("ecomcx-seo:analysis.focus_keyword"), noKw.Select(Ref).ToList(), posts.Count,
                    Text.T("ecomcx-seo:analysis.every_post_has_a_focus"), Text.T("ecomcx-seo:analysis.posts_have_no_focus_keyword"), warnOnly: true));
                var low = posts.Where(p => p.Seo?["score"] is JsonValue v && v.TryGetValue<int>(out var sc) && sc < 50).ToList();
                items.Add(Count("low-score", "content", Text.T("ecomcx-seo:analysis.low_seo_scores"), low.Select(Ref).ToList(), posts.Count,
                    Text.T("ecomcx-seo:analysis.no_posts_score_below_50"), Text.T("ecomcx-seo:analysis.posts_score_below_50"), warnOnly: true));
                var dupTitles = posts.GroupBy(p => (SeoSettings.Str(p.Seo?["title"]) is { Length: > 0 } t ? t : p.Title).Trim().ToLowerInvariant())
                    .Where(g => g.Key.Length > 0 && g.Count() > 1).SelectMany(g => g).ToList();
                items.Add(Count("duplicate-titles", "content", Text.T("ecomcx-seo:analysis.duplicate_titles"), dupTitles.Select(Ref).ToList(), posts.Count,
                    Text.T("ecomcx-seo:analysis.no_duplicate_titles"), Text.T("ecomcx-seo:analysis.posts_share_an_seo_title")));
                var thin = posts.Where(p => p.Type == "post" && WordCount(p.Content) is > 0 and < 300).ToList();
                items.Add(Count("thin-content", "content", Text.T("ecomcx-seo:analysis.thin_content"), thin.Select(Ref).ToList(), posts.Count,
                    Text.T("ecomcx-seo:analysis.no_posts_under_300_words"), Text.T("ecomcx-seo:analysis.posts_have_fewer_than_300"), warnOnly: true));
                var noindex = posts.Where(p => SeoSettings.Bool(p.Seo?["robots"]?["noindex"])).ToList();
                if (noindex.Count > 0)
                    items.Add(new("noindex-posts", "content", Text.T("ecomcx-seo:analysis.noindexed_posts"), "info", Text.T("ecomcx-seo:analysis.posts_are_set_to_noindex"), noindex.Select(Ref).Take(50).ToList(), [noindex.Count.ToString()]));
                var noAlt = await Db.ScalarAsync<long>(conn, "select count(*) from media where mime_type like 'image/%' and coalesce(alt, '') = ''", ct);
                var images = await Db.ScalarAsync<long>(conn, "select count(*) from media where mime_type like 'image/%'", ct);
                items.Add(new("image-alt", "content", Text.T("ecomcx-seo:analysis.image_alt_text"), noAlt == 0 ? "pass" : "warning",
                    noAlt == 0 ? Text.T("ecomcx-seo:analysis.all_images_have_alt_text") : Text.T("ecomcx-seo:analysis.images_have_no_alt_text"), null, [noAlt.ToString(), images.ToString()]));

                // ---------------------------------------------------------- Cấu hình SEO
                var kgName = SeoSettings.Str(s["knowledgeGraph"]?["name"]);
                items.Add(new("knowledge-graph", "config", Text.T("ecomcx-seo:analysis.organization_person_info"), kgName.Length > 0 && s["knowledgeGraph"]?["logo"] is JsonObject ? "pass" : "warning",
                    kgName.Length > 0 ? Text.T("ecomcx-seo:analysis.organization_schema") : Text.T("ecomcx-seo:analysis.no_organization_name_and_logo"), null, [kgName]));
                var google = SeoSettings.Str(s["webmaster"]?["google"]);
                items.Add(new("search-console", "config", "Google Search Console", google.Length > 0 ? "pass" : "warning",
                    google.Length > 0 ? Text.T("ecomcx-seo:analysis.google_verification_code_is_set") : Text.T("ecomcx-seo:analysis.the_site_isn_t_verified")));
                items.Add(new("og-image", "config", Text.T("ecomcx-seo:analysis.default_share_image"), s["social"]?["ogImage"] is JsonObject ? "pass" : "warning",
                    s["social"]?["ogImage"] is JsonObject ? Text.T("ecomcx-seo:analysis.a_default_share_image_is") : Text.T("ecomcx-seo:analysis.no_default_share_image_posts")));

                // ---------------------------------------------------------- Trang chủ (HTML thật)
                if (Uri.TryCreate(siteUrl, UriKind.Absolute, out var home))
                {
                    var page = await FetchAsync(http, home, allowPrivate: true, ct);
                    if (page.Error is not null) items.Add(new("homepage", "homepage", Text.T("ecomcx-seo:analysis.home"), "fail", page.Error));
                    else items.AddRange(InspectHtml(page, home).Select(i => i with { Group = "homepage" }));
                    var robots = await FetchAsync(http, new Uri(home, "/robots.txt"), allowPrivate: true, ct);
                    var blocked = robots.Html is { } rt && DisallowAll().IsMatch(rt);
                    items.Add(new("robots-txt", "basic", "robots.txt", robots.Error is null && !blocked ? "pass" : "fail",
                        robots.Error ?? (blocked ? Text.T("ecomcx-seo:analysis.robots_txt_blocks_the_entire") : Text.T("ecomcx-seo:analysis.robots_txt_works"))));
                    var sitemap = await FetchAsync(http, new Uri(home, "/sitemap.xml"), allowPrivate: true, ct);
                    var urlCount = sitemap.Html is { } sx ? Regex.Matches(sx, "<loc>").Count : 0;
                    items.Add(new("sitemap", "basic", "Sitemap", sitemap.Error is null && urlCount > 0 ? "pass" : "fail",
                        sitemap.Error ?? (urlCount > 0 ? Text.T("ecomcx-seo:analysis.sitemap_xml_has_urls") : Text.T("ecomcx-seo:analysis.sitemap_xml_is_empty")), null, [urlCount.ToString()]));
                }

                var scored = items.Where(i => i.Status != "info").ToList();
                var score = scored.Count == 0 ? 100 : (int)Math.Round(scored.Sum(i => i.Status switch { "pass" => 1.0, "warning" => 0.5, _ => 0 }) * 100 / scored.Count);
                var result = new JsonObject { ["score"] = score, ["at"] = DateTimeOffset.UtcNow, ["items"] = JsonSerializerNode(items) };
                await options.SetAsync("ecx_seo_last_audit", result, autoload: false, ct: ct);
                return Results.Ok(result);
            }).RequireCapability(Caps.Analysis);

            r.MapGet("/analysis/site", async (IOptionStore options, CancellationToken ct) =>
                Results.Json(await options.GetAsync("ecx_seo_last_audit", ct))).RequireCapability(Caps.Analysis);

            // Phân tích URL bất kỳ (đối thủ) — chặn địa chỉ nội bộ để không bị lợi dụng dò mạng máy chủ (SSRF)
            r.MapPost("/analysis/competitor", async (CompetitorInput input, IHttpClientFactory http, CancellationToken ct) =>
            {
                if (!Uri.TryCreate(input.Url?.Trim(), UriKind.Absolute, out var url) || url.Scheme is not ("http" or "https"))
                    return Results.Json(new { title = Text.T("ecomcx-seo:analysis.enter_a_full_url_e") }, statusCode: 422);
                var page = await FetchAsync(http, url, allowPrivate: false, ct);
                if (page.Error is not null) return Results.Json(new { title = page.Error }, statusCode: 422);
                var items = InspectHtml(page, url);
                var score = (int)Math.Round(items.Where(i => i.Status != "info").Sum(i => i.Status switch { "pass" => 1.0, "warning" => 0.5, _ => 0 }) * 100 / Math.Max(1, items.Count(i => i.Status != "info")));
                return Results.Ok(new { url = page.FinalUrl, score, items = WithArgs(items), timeMs = page.TimeMs, size = page.Size });
            }).RequireCapability(Caps.Analysis);
        });
    }

    private static JsonArray JsonSerializerNode(List<AuditItem> items) =>
        (JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(WithArgs(items), SeoSettings.Json)) as JsonArray)!;

    /// <summary>Thông điệp là token + biến vị trí {0}, {1}… trong Args → gói biến vào token (CMS dịch theo ngôn ngữ người xem).</summary>
    private static List<AuditItem> WithArgs(List<AuditItem> items) => [.. items.Select(i =>
        i.Args is { Count: > 0 } args && Text.TryParse(i.Message, out var key, out var json) && json is null
            ? i with { Message = Text.T(key, args.Select((a, n) => (n, a)).ToDictionary(x => x.n.ToString(), x => (object)x.a)), Args = null }
            : i)];

    private static AuditItem Count(string id, string group, string title, List<AuditRef> bad, int total, string ok, string fail, bool warnOnly = false) =>
        bad.Count == 0 ? new(id, group, title, "pass", ok)
            : new(id, group, title, warnOnly || bad.Count * 10 < Math.Max(total, 1) ? "warning" : "fail", fail, bad.Take(50).ToList(), [bad.Count.ToString()]);

    /// <summary>Số từ trong nội dung khối (đếm chữ trong mọi node "text" và khối HTML).</summary>
    public static int WordCount(string contentJson)
    {
        if (string.IsNullOrEmpty(contentJson)) return 0;
        JsonNode? root;
        try { root = JsonNode.Parse(contentJson); } catch { return 0; }
        var sb = new StringBuilder();
        void Walk(JsonNode? n)
        {
            if (n is JsonObject o)
            {
                if (SeoSettings.Str(o["type"]) == "text") sb.Append(' ').Append(SeoSettings.Str(o["text"]));
                if (SeoSettings.Str(o["type"]) == "html") sb.Append(' ').Append(Tags().Replace(SeoSettings.Str(o["data"]?["html"]), " "));
                foreach (var (_, v) in o) Walk(v);
            }
            else if (n is JsonArray a) foreach (var v in a) Walk(v);
        }
        Walk(root);
        return Words().Matches(sb.ToString()).Count;
    }

    // ------------------------------------------------------------------ tải trang an toàn

    public sealed record Page(string? Html, string? Error, string FinalUrl, long TimeMs, int Size, Dictionary<string, string> Headers);

    /// <summary>Tải HTML (tối đa 3MB, 15 giây, 5 lần chuyển hướng). allowPrivate = false: chặn IP nội bộ ở mọi bước chuyển hướng.</summary>
    public static async Task<Page> FetchAsync(IHttpClientFactory http, Uri url, bool allowPrivate, CancellationToken ct)
    {
        var handler = new SocketsHttpHandler { AllowAutoRedirect = false, AutomaticDecompression = DecompressionMethods.All, ConnectTimeout = TimeSpan.FromSeconds(8) };
        if (!allowPrivate)
            handler.ConnectCallback = async (context, token) =>
            {
                // Kiểm tra IP thật khi kết nối (chống DNS rebinding)
                var addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, token);
                var ip = addresses.FirstOrDefault(a => !IsPrivate(a)) ?? throw new HttpRequestException(Text.T("ecomcx-seo:analysis.internal_addresses_are_not_allowed"));
                if (addresses.Any(IsPrivate)) throw new HttpRequestException(Text.T("ecomcx-seo:analysis.internal_addresses_are_not_allowed"));
                var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                try { await socket.ConnectAsync(ip, context.DnsEndPoint.Port, token); return new NetworkStream(socket, ownsSocket: true); }
                catch { socket.Dispose(); throw; }
            };
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(15) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; EcomcxSEO/1.0; +seo-analysis)");
        var sw = Stopwatch.StartNew();
        var current = url;
        try
        {
            for (var hop = 0; hop < 6; hop++)
            {
                using var res = await client.GetAsync(current, HttpCompletionOption.ResponseHeadersRead, ct);
                if ((int)res.StatusCode is >= 300 and < 400 && res.Headers.Location is { } loc)
                {
                    current = loc.IsAbsoluteUri ? loc : new Uri(current, loc);
                    if (current.Scheme is not ("http" or "https")) return Fail(Text.T("ecomcx-seo:analysis.redirected_to_an_unsupported_protocol"));
                    continue;
                }
                if (!res.IsSuccessStatusCode) return Fail($"HTTP {(int)res.StatusCode}");
                await using var stream = await res.Content.ReadAsStreamAsync(ct);
                var buffer = new byte[3 * 1024 * 1024];
                var read = 0;
                int n;
                while (read < buffer.Length && (n = await stream.ReadAsync(buffer.AsMemory(read), ct)) > 0) read += n;
                var headers = res.Headers.Concat(res.Content.Headers).ToDictionary(h => h.Key.ToLowerInvariant(), h => string.Join(", ", h.Value));
                return new Page(Encoding.UTF8.GetString(buffer, 0, read), null, current.ToString(), sw.ElapsedMilliseconds, read, headers);
            }
            return Fail(Text.T("ecomcx-seo:analysis.too_many_redirects"));
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or SocketException)
        {
            return Fail(e is TaskCanceledException ? Text.T("ecomcx-seo:analysis.timed_out_15_seconds") : Text.T("ecomcx-seo:analysis.couldn_t_load_the_page"));
        }
        Page Fail(string error) => new(null, error, current.ToString(), sw.ElapsedMilliseconds, 0, []);
    }

    public static bool IsPrivate(IPAddress ip)
    {
        if (IPAddress.IsLoopback(ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any)) return true;
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
            return ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6UniqueLocal || ip.IsIPv6Multicast;
        var b = ip.GetAddressBytes();
        return b[0] == 10 || b[0] == 127 || b[0] == 0 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168)
            || (b[0] == 169 && b[1] == 254) || (b[0] == 100 && b[1] >= 64 && b[1] <= 127) || b[0] >= 224;
    }

    // ------------------------------------------------------------------ kiểm tra HTML

    public static List<AuditItem> InspectHtml(Page page, Uri url)
    {
        var html = page.Html ?? "";
        var items = new List<AuditItem>();
        string Attr(string tag, string attr) => Regex.Match(tag, $@"\b{attr}\s*=\s*([""'])(.*?)\1", RegexOptions.IgnoreCase | RegexOptions.Singleline).Groups[2].Value;
        string? Meta(string name) => MetaTags().Matches(html).Select(m => m.Value)
            .FirstOrDefault(t => string.Equals(Attr(t, "name"), name, StringComparison.OrdinalIgnoreCase) || string.Equals(Attr(t, "property"), name, StringComparison.OrdinalIgnoreCase)) is { } tag ? WebUtility.HtmlDecode(Attr(tag, "content")) : null;

        var title = WebUtility.HtmlDecode(TitleTag().Match(html).Groups[1].Value).Trim();
        items.Add(new("title", "page", Text.T("ecomcx-seo:analysis.title_tag"), title.Length == 0 ? "fail" : title.Length is >= 30 and <= 65 ? "pass" : "warning",
            title.Length == 0 ? Text.T("ecomcx-seo:analysis.the_page_has_no_title") : title.Length is >= 30 and <= 65 ? Text.T("ecomcx-seo:analysis.characters") : Text.T("ecomcx-seo:analysis.characters_aim_for_30_65"), null, [title, title.Length.ToString()]));
        var desc = Meta("description") ?? "";
        items.Add(new("description", "page", Text.T("ecomcx-seo:analysis.meta_description"), desc.Length == 0 ? "fail" : desc.Length is >= 70 and <= 165 ? "pass" : "warning",
            desc.Length == 0 ? Text.T("ecomcx-seo:analysis.no_meta_description_tag") : desc.Length is >= 70 and <= 165 ? Text.T("ecomcx-seo:analysis.characters_2") : Text.T("ecomcx-seo:analysis.characters_aim_for_70_165"), null, [desc.Length.ToString()]));
        var h1 = H1().Matches(html).Count;
        items.Add(new("h1", "page", Text.T("ecomcx-seo:analysis.h1_tag"), h1 == 1 ? "pass" : h1 == 0 ? "fail" : "warning", h1 == 1 ? Text.T("ecomcx-seo:analysis.exactly_one_h1_tag") : h1 == 0 ? Text.T("ecomcx-seo:analysis.no_h1_tag") : Text.T("ecomcx-seo:analysis.h1_tags_there_should_be"), null, [h1.ToString()]));
        var h2 = H2().Matches(html).Count;
        items.Add(new("h2", "page", Text.T("ecomcx-seo:analysis.h2_tags"), h2 > 0 ? "pass" : "warning", h2 > 0 ? Text.T("ecomcx-seo:analysis.h2_tags_2") : Text.T("ecomcx-seo:analysis.no_h2_tags_content_should"), null, [h2.ToString()]));
        var imgs = ImgTags().Matches(html).Select(m => m.Value).ToList();
        var noAlt = imgs.Count(i => !Regex.IsMatch(i, @"\balt\s*=", RegexOptions.IgnoreCase));
        items.Add(new("img-alt", "page", Text.T("ecomcx-seo:analysis.image_alt"), noAlt == 0 ? "pass" : "warning", noAlt == 0 ? Text.T("ecomcx-seo:analysis.all_images_have_alt") : Text.T("ecomcx-seo:analysis.images_are_missing_the_alt"), null, [noAlt.ToString(), imgs.Count.ToString()]));
        var canonical = LinkTags().Matches(html).Select(m => m.Value).FirstOrDefault(t => Attr(t, "rel").Equals("canonical", StringComparison.OrdinalIgnoreCase)) is { } c ? Attr(c, "href") : "";
        items.Add(new("canonical", "page", "Canonical", canonical.Length > 0 ? "pass" : "warning", canonical.Length > 0 ? "{0}" : Text.T("ecomcx-seo:analysis.no_canonical_tag_risk_of"), null, [canonical]));
        var robots = Meta("robots") ?? "";
        items.Add(new("robots-meta", "page", "Meta robots", robots.Contains("noindex", StringComparison.OrdinalIgnoreCase) ? "fail" : "pass",
            robots.Length == 0 ? Text.T("ecomcx-seo:analysis.not_blocking_indexing") : robots.Contains("noindex", StringComparison.OrdinalIgnoreCase) ? Text.T("ecomcx-seo:analysis.the_page_blocks_indexing") : "{0}", null, [robots]));
        var og = Meta("og:title") is not null && Meta("og:image") is not null;
        items.Add(new("open-graph", "page", "Open Graph", og ? "pass" : "warning", og ? Text.T("ecomcx-seo:analysis.has_og_title_and_og") : Text.T("ecomcx-seo:analysis.missing_og_title_or_og")));
        var twitter = Meta("twitter:card");
        items.Add(new("twitter", "page", "Twitter card", twitter is not null ? "pass" : "warning", twitter is not null ? "twitter:card = {0}" : Text.T("ecomcx-seo:analysis.missing_twitter_card_tag"), null, [twitter ?? ""]));
        var jsonLd = JsonLd().Matches(html);
        var types = jsonLd.SelectMany(m => Regex.Matches(m.Groups[1].Value, @"""@type""\s*:\s*""([^""]+)""").Select(x => x.Groups[1].Value)).Distinct().ToList();
        items.Add(new("schema", "page", Text.T("ecomcx-seo:analysis.structured_data_schema"), types.Count > 0 ? "pass" : "warning", types.Count > 0 ? Text.T("ecomcx-seo:analysis.schema_found") : Text.T("ecomcx-seo:analysis.no_json_ld_schema"), null, [string.Join(", ", types.Take(12))]));
        var lang = Regex.Match(html, @"<html[^>]*\blang\s*=\s*[""']([^""']+)", RegexOptions.IgnoreCase).Groups[1].Value;
        items.Add(new("lang", "page", Text.T("ecomcx-seo:analysis.language_declaration"), lang.Length > 0 ? "pass" : "warning", lang.Length > 0 ? "lang=\"{0}\"" : Text.T("ecomcx-seo:analysis.the_html_tag_has_no"), null, [lang]));
        var viewport = Meta("viewport");
        items.Add(new("viewport", "page", Text.T("ecomcx-seo:analysis.mobile_display"), viewport is not null ? "pass" : "fail", viewport is not null ? Text.T("ecomcx-seo:analysis.has_a_viewport_tag") : Text.T("ecomcx-seo:analysis.no_viewport_tag_poor_display")));
        items.Add(new("https-page", "page", "HTTPS", page.FinalUrl.StartsWith("https://") ? "pass" : "fail", page.FinalUrl.StartsWith("https://") ? Text.T("ecomcx-seo:analysis.the_page_uses_https") : Text.T("ecomcx-seo:analysis.the_page_does_not_use")));
        items.Add(new("speed", "page", Text.T("ecomcx-seo:analysis.response_time"), page.TimeMs < 800 ? "pass" : page.TimeMs < 2500 ? "warning" : "fail", "{0} ms", null, [page.TimeMs.ToString()]));
        items.Add(new("size", "page", Text.T("ecomcx-seo:analysis.html_size"), page.Size < 500_000 ? "pass" : "warning", "{0} KB", null, [(page.Size / 1024).ToString()]));
        var compressed = page.Headers.TryGetValue("content-encoding", out var enc) && enc.Length > 0;
        items.Add(new("compression", "page", Text.T("ecomcx-seo:analysis.compression"), compressed ? "pass" : "warning", compressed ? Text.T("ecomcx-seo:analysis.compressed_with") : Text.T("ecomcx-seo:analysis.the_server_doesn_t_compress"), null, [enc ?? ""]));
        var links = Anchors().Matches(html).Select(m => m.Groups[1].Value).Where(h => !h.StartsWith('#') && !h.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase)).ToList();
        var external = links.Count(h => Uri.TryCreate(h, UriKind.Absolute, out var u) && u.Host != url.Host);
        items.Add(new("links", "page", Text.T("ecomcx-seo:analysis.links"), links.Count > 0 ? "pass" : "warning", Text.T("ecomcx-seo:analysis.internal_links_external_links"), null, [(links.Count - external).ToString(), external.ToString()]));
        var text = Tags().Replace(Regex.Replace(html, @"<(script|style)[^>]*>.*?</\1>", " ", RegexOptions.IgnoreCase | RegexOptions.Singleline), " ");
        var words = Words().Matches(WebUtility.HtmlDecode(text)).Count;
        items.Add(new("words", "page", Text.T("ecomcx-seo:analysis.word_count"), words >= 300 ? "pass" : "warning", words >= 300 ? Text.T("ecomcx-seo:analysis.words") : Text.T("ecomcx-seo:analysis.words_not_much_content"), null, [words.ToString()]));
        var favicon = LinkTags().Matches(html).Any(m => Attr(m.Value, "rel").Contains("icon", StringComparison.OrdinalIgnoreCase));
        items.Add(new("favicon", "page", "Favicon", favicon ? "pass" : "warning", favicon ? Text.T("ecomcx-seo:analysis.has_a_favicon") : Text.T("ecomcx-seo:analysis.no_favicon_declared")));
        return items;
    }

    [GeneratedRegex(@"<title[^>]*>(.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline)] private static partial Regex TitleTag();
    [GeneratedRegex(@"<meta\b[^>]*>", RegexOptions.IgnoreCase)] private static partial Regex MetaTags();
    [GeneratedRegex(@"<link\b[^>]*>", RegexOptions.IgnoreCase)] private static partial Regex LinkTags();
    [GeneratedRegex(@"<img\b[^>]*>", RegexOptions.IgnoreCase)] private static partial Regex ImgTags();
    [GeneratedRegex(@"<h1[\s>]", RegexOptions.IgnoreCase)] private static partial Regex H1();
    [GeneratedRegex(@"<h2[\s>]", RegexOptions.IgnoreCase)] private static partial Regex H2();
    [GeneratedRegex(@"<a\b[^>]*\bhref\s*=\s*[""']([^""']+)[""']", RegexOptions.IgnoreCase)] private static partial Regex Anchors();
    [GeneratedRegex(@"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", RegexOptions.IgnoreCase | RegexOptions.Singleline)] private static partial Regex JsonLd();
    [GeneratedRegex(@"<[^>]+>")] private static partial Regex Tags();
    [GeneratedRegex(@"[\p{L}\p{N}]+")] private static partial Regex Words();
    [GeneratedRegex(@"(?im)^\s*disallow\s*:\s*/\s*$")] private static partial Regex DisallowAll();
}
