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
                items.Add(new("site-title", "basic", "Tên website", title.Length >= 3 ? "pass" : "fail",
                    title.Length >= 3 ? "Tên website: “{0}”" : "Chưa đặt tên website (Cài đặt › Tổng quan)", null, [title]));
                var tagline = await Opt("site_tagline");
                items.Add(new("tagline", "basic", "Khẩu hiệu", tagline.Length > 0 ? "pass" : "warning",
                    tagline.Length > 0 ? "Khẩu hiệu: “{0}”" : "Chưa có khẩu hiệu — dùng cho tiêu đề trang chủ và mô tả mặc định", null, [tagline]));
                var indexable = (await options.GetAsync("blog_public", ct)) is not JsonValue bp || !bp.TryGetValue<bool>(out var b) || b;
                items.Add(new("indexable", "basic", "Cho phép máy tìm kiếm", indexable ? "pass" : "fail",
                    indexable ? "Website cho phép máy tìm kiếm index" : "Đang chặn máy tìm kiếm (Cài đặt › Đọc) — website sẽ không xuất hiện trên Google"));
                var siteUrl = await IndexNow.SiteUrlAsync(options, ct);
                var https = siteUrl.StartsWith("https://");
                items.Add(new("https", "basic", "HTTPS", https ? "pass" : "fail",
                    https ? "Website dùng HTTPS" : "Địa chỉ website chưa dùng HTTPS ({0}) — Google ưu tiên trang HTTPS", null, [siteUrl]));
                var structure = await Opt("permalink_structure") is { Length: > 0 } ps ? ps : "/%postname%";
                items.Add(new("permalink", "basic", "Đường dẫn tĩnh", structure.Contains("%postname%") ? "pass" : "warning",
                    structure.Contains("%postname%") ? "Cấu trúc đường dẫn có tên bài ({0})" : "Cấu trúc {0} không chứa tên bài — đường dẫn khó hiểu với người đọc và máy tìm kiếm", null, [structure]));

                // ---------------------------------------------------------- Nội dung
                await using var conn = await db.OpenAsync(ct);
                var posts = await Db.QueryAsync(conn, $"""
                    select id, type, title, excerpt, meta->'{SeoMeta.MetaKey}', content from posts
                    where status = 'publish' and type in ('post', 'page') order by updated_at desc limit 3000
                    """, r => (Id: r.GetInt64(0), Type: r.GetString(1), Title: r.GetString(2), Excerpt: r.GetString(3),
                        Seo: r.IsDBNull(4) ? null : JsonNode.Parse(r.GetString(4)), Content: r.IsDBNull(5) ? "" : r.GetString(5)), ct);
                AuditRef Ref((long Id, string Type, string Title, string Excerpt, JsonNode? Seo, string Content) p) => new(p.Id, p.Title, p.Type);

                var noDesc = posts.Where(p => SeoSettings.Str(p.Seo?["description"]).Length == 0 && p.Excerpt.Trim().Length == 0).ToList();
                items.Add(Count("meta-description", "content", "Mô tả SEO", noDesc.Select(Ref).ToList(), posts.Count,
                    "Mọi bài đều có mô tả SEO", "{0} bài chưa có mô tả SEO hoặc tóm tắt — Google sẽ tự cắt đoạn bất kỳ"));
                var noKw = posts.Where(p => !SeoSettings.Strings(p.Seo?["focusKeywords"]).Any()).ToList();
                items.Add(Count("focus-keyword", "content", "Từ khoá chính", noKw.Select(Ref).ToList(), posts.Count,
                    "Mọi bài đều có từ khoá chính", "{0} bài chưa đặt từ khoá chính — chưa tối ưu được theo từ khoá", warnOnly: true));
                var low = posts.Where(p => p.Seo?["score"] is JsonValue v && v.TryGetValue<int>(out var sc) && sc < 50).ToList();
                items.Add(Count("low-score", "content", "Điểm SEO thấp", low.Select(Ref).ToList(), posts.Count,
                    "Không có bài điểm SEO dưới 50", "{0} bài có điểm SEO dưới 50", warnOnly: true));
                var dupTitles = posts.GroupBy(p => (SeoSettings.Str(p.Seo?["title"]) is { Length: > 0 } t ? t : p.Title).Trim().ToLowerInvariant())
                    .Where(g => g.Key.Length > 0 && g.Count() > 1).SelectMany(g => g).ToList();
                items.Add(Count("duplicate-titles", "content", "Tiêu đề trùng nhau", dupTitles.Select(Ref).ToList(), posts.Count,
                    "Không có tiêu đề trùng", "{0} bài có tiêu đề SEO trùng với bài khác — máy tìm kiếm khó phân biệt"));
                var thin = posts.Where(p => p.Type == "post" && WordCount(p.Content) is > 0 and < 300).ToList();
                items.Add(Count("thin-content", "content", "Nội dung quá ngắn", thin.Select(Ref).ToList(), posts.Count,
                    "Không có bài dưới 300 từ", "{0} bài dưới 300 từ — nội dung mỏng thường xếp hạng kém", warnOnly: true));
                var noindex = posts.Where(p => SeoSettings.Bool(p.Seo?["robots"]?["noindex"])).ToList();
                if (noindex.Count > 0)
                    items.Add(new("noindex-posts", "content", "Bài chặn index", "info", "{0} bài đang đặt noindex (cố ý ẩn khỏi máy tìm kiếm)", noindex.Select(Ref).Take(50).ToList(), [noindex.Count.ToString()]));
                var noAlt = await Db.ScalarAsync<long>(conn, "select count(*) from media where mime_type like 'image/%' and coalesce(alt, '') = ''", ct);
                var images = await Db.ScalarAsync<long>(conn, "select count(*) from media where mime_type like 'image/%'", ct);
                items.Add(new("image-alt", "content", "Văn bản thay thế của ảnh", noAlt == 0 ? "pass" : "warning",
                    noAlt == 0 ? "Cả {1} ảnh đều có văn bản thay thế" : "{0}/{1} ảnh chưa có văn bản thay thế (alt) — bật SEO hình ảnh để tự điền khi hiển thị", null, [noAlt.ToString(), images.ToString()]));

                // ---------------------------------------------------------- Cấu hình SEO
                var kgName = SeoSettings.Str(s["knowledgeGraph"]?["name"]);
                items.Add(new("knowledge-graph", "config", "Thông tin tổ chức / cá nhân", kgName.Length > 0 && s["knowledgeGraph"]?["logo"] is JsonObject ? "pass" : "warning",
                    kgName.Length > 0 ? "Schema tổ chức: {0}" : "Chưa khai báo tên và logo tổ chức (SEO › Schema) — Google dùng cho bảng tri thức", null, [kgName]));
                var google = SeoSettings.Str(s["webmaster"]?["google"]);
                items.Add(new("search-console", "config", "Google Search Console", google.Length > 0 ? "pass" : "warning",
                    google.Length > 0 ? "Đã khai báo mã xác minh Google" : "Chưa xác minh website với Google Search Console"));
                items.Add(new("og-image", "config", "Ảnh chia sẻ mặc định", s["social"]?["ogImage"] is JsonObject ? "pass" : "warning",
                    s["social"]?["ogImage"] is JsonObject ? "Đã có ảnh mặc định khi chia sẻ lên mạng xã hội" : "Chưa có ảnh chia sẻ mặc định — bài không có ảnh đại diện sẽ hiện trống trên Facebook/Zalo"));

                // ---------------------------------------------------------- Trang chủ (HTML thật)
                if (Uri.TryCreate(siteUrl, UriKind.Absolute, out var home))
                {
                    var page = await FetchAsync(http, home, allowPrivate: true, ct);
                    if (page.Error is not null) items.Add(new("homepage", "homepage", "Trang chủ", "fail", page.Error));
                    else items.AddRange(InspectHtml(page, home).Select(i => i with { Group = "homepage" }));
                    var robots = await FetchAsync(http, new Uri(home, "/robots.txt"), allowPrivate: true, ct);
                    var blocked = robots.Html is { } rt && DisallowAll().IsMatch(rt);
                    items.Add(new("robots-txt", "basic", "robots.txt", robots.Error is null && !blocked ? "pass" : "fail",
                        robots.Error ?? (blocked ? "robots.txt đang chặn toàn bộ website" : "robots.txt hoạt động")));
                    var sitemap = await FetchAsync(http, new Uri(home, "/sitemap.xml"), allowPrivate: true, ct);
                    var urlCount = sitemap.Html is { } sx ? Regex.Matches(sx, "<loc>").Count : 0;
                    items.Add(new("sitemap", "basic", "Sitemap", sitemap.Error is null && urlCount > 0 ? "pass" : "fail",
                        sitemap.Error ?? (urlCount > 0 ? "sitemap.xml có {0} URL" : "sitemap.xml trống"), null, [urlCount.ToString()]));
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
                    return Results.Json(new { title = "Nhập URL đầy đủ, vd https://example.com" }, statusCode: 422);
                var page = await FetchAsync(http, url, allowPrivate: false, ct);
                if (page.Error is not null) return Results.Json(new { title = page.Error }, statusCode: 422);
                var items = InspectHtml(page, url);
                var score = (int)Math.Round(items.Where(i => i.Status != "info").Sum(i => i.Status switch { "pass" => 1.0, "warning" => 0.5, _ => 0 }) * 100 / Math.Max(1, items.Count(i => i.Status != "info")));
                return Results.Ok(new { url = page.FinalUrl, score, items, timeMs = page.TimeMs, size = page.Size });
            }).RequireCapability(Caps.Analysis);
        });
    }

    private static JsonArray JsonSerializerNode(List<AuditItem> items) =>
        (JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(items, SeoSettings.Json)) as JsonArray)!;

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
                var ip = addresses.FirstOrDefault(a => !IsPrivate(a)) ?? throw new HttpRequestException("Địa chỉ nội bộ không được phép");
                if (addresses.Any(IsPrivate)) throw new HttpRequestException("Địa chỉ nội bộ không được phép");
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
                    if (current.Scheme is not ("http" or "https")) return Fail("Chuyển hướng tới giao thức không hỗ trợ");
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
            return Fail("Chuyển hướng quá nhiều lần");
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or SocketException)
        {
            return Fail(e is TaskCanceledException ? "Quá thời gian chờ (15 giây)" : "Không tải được trang — kiểm tra địa chỉ hoặc thử lại sau");
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
        items.Add(new("title", "page", "Thẻ tiêu đề", title.Length == 0 ? "fail" : title.Length is >= 30 and <= 65 ? "pass" : "warning",
            title.Length == 0 ? "Trang không có thẻ <title>" : title.Length is >= 30 and <= 65 ? "“{0}” ({1} ký tự)" : "“{0}” ({1} ký tự — nên 30–65 ký tự)", null, [title, title.Length.ToString()]));
        var desc = Meta("description") ?? "";
        items.Add(new("description", "page", "Mô tả (meta description)", desc.Length == 0 ? "fail" : desc.Length is >= 70 and <= 165 ? "pass" : "warning",
            desc.Length == 0 ? "Không có thẻ meta description" : desc.Length is >= 70 and <= 165 ? "{0} ký tự" : "{0} ký tự — nên 70–165 ký tự", null, [desc.Length.ToString()]));
        var h1 = H1().Matches(html).Count;
        items.Add(new("h1", "page", "Thẻ H1", h1 == 1 ? "pass" : h1 == 0 ? "fail" : "warning", h1 == 1 ? "Có đúng một thẻ H1" : h1 == 0 ? "Không có thẻ H1" : "Có {0} thẻ H1 — nên chỉ có một", null, [h1.ToString()]));
        var h2 = H2().Matches(html).Count;
        items.Add(new("h2", "page", "Thẻ H2", h2 > 0 ? "pass" : "warning", h2 > 0 ? "Có {0} thẻ H2" : "Không có thẻ H2 — nội dung nên chia mục", null, [h2.ToString()]));
        var imgs = ImgTags().Matches(html).Select(m => m.Value).ToList();
        var noAlt = imgs.Count(i => !Regex.IsMatch(i, @"\balt\s*=", RegexOptions.IgnoreCase));
        items.Add(new("img-alt", "page", "Alt của ảnh", noAlt == 0 ? "pass" : "warning", noAlt == 0 ? "{1} ảnh đều có alt" : "{0}/{1} ảnh thiếu thuộc tính alt", null, [noAlt.ToString(), imgs.Count.ToString()]));
        var canonical = LinkTags().Matches(html).Select(m => m.Value).FirstOrDefault(t => Attr(t, "rel").Equals("canonical", StringComparison.OrdinalIgnoreCase)) is { } c ? Attr(c, "href") : "";
        items.Add(new("canonical", "page", "Canonical", canonical.Length > 0 ? "pass" : "warning", canonical.Length > 0 ? "{0}" : "Không có thẻ canonical — dễ bị trùng lặp nội dung", null, [canonical]));
        var robots = Meta("robots") ?? "";
        items.Add(new("robots-meta", "page", "Meta robots", robots.Contains("noindex", StringComparison.OrdinalIgnoreCase) ? "fail" : "pass",
            robots.Length == 0 ? "Không chặn index" : robots.Contains("noindex", StringComparison.OrdinalIgnoreCase) ? "Trang đang chặn index ({0})" : "{0}", null, [robots]));
        var og = Meta("og:title") is not null && Meta("og:image") is not null;
        items.Add(new("open-graph", "page", "Open Graph", og ? "pass" : "warning", og ? "Có og:title và og:image (chia sẻ mạng xã hội đẹp)" : "Thiếu og:title hoặc og:image"));
        var twitter = Meta("twitter:card");
        items.Add(new("twitter", "page", "Twitter card", twitter is not null ? "pass" : "warning", twitter is not null ? "twitter:card = {0}" : "Thiếu thẻ twitter:card", null, [twitter ?? ""]));
        var jsonLd = JsonLd().Matches(html);
        var types = jsonLd.SelectMany(m => Regex.Matches(m.Groups[1].Value, @"""@type""\s*:\s*""([^""]+)""").Select(x => x.Groups[1].Value)).Distinct().ToList();
        items.Add(new("schema", "page", "Dữ liệu có cấu trúc (schema)", types.Count > 0 ? "pass" : "warning", types.Count > 0 ? "Có schema: {0}" : "Không có JSON-LD schema", null, [string.Join(", ", types.Take(12))]));
        var lang = Regex.Match(html, @"<html[^>]*\blang\s*=\s*[""']([^""']+)", RegexOptions.IgnoreCase).Groups[1].Value;
        items.Add(new("lang", "page", "Khai báo ngôn ngữ", lang.Length > 0 ? "pass" : "warning", lang.Length > 0 ? "lang=\"{0}\"" : "Thẻ <html> thiếu thuộc tính lang", null, [lang]));
        var viewport = Meta("viewport");
        items.Add(new("viewport", "page", "Hiển thị trên điện thoại", viewport is not null ? "pass" : "fail", viewport is not null ? "Có thẻ viewport" : "Thiếu thẻ viewport — hiển thị kém trên điện thoại"));
        items.Add(new("https-page", "page", "HTTPS", page.FinalUrl.StartsWith("https://") ? "pass" : "fail", page.FinalUrl.StartsWith("https://") ? "Trang dùng HTTPS" : "Trang không dùng HTTPS"));
        items.Add(new("speed", "page", "Thời gian phản hồi", page.TimeMs < 800 ? "pass" : page.TimeMs < 2500 ? "warning" : "fail", "{0} ms", null, [page.TimeMs.ToString()]));
        items.Add(new("size", "page", "Dung lượng HTML", page.Size < 500_000 ? "pass" : "warning", "{0} KB", null, [(page.Size / 1024).ToString()]));
        var compressed = page.Headers.TryGetValue("content-encoding", out var enc) && enc.Length > 0;
        items.Add(new("compression", "page", "Nén dữ liệu", compressed ? "pass" : "warning", compressed ? "Nén {0}" : "Máy chủ không nén HTML (gzip/br)", null, [enc ?? ""]));
        var links = Anchors().Matches(html).Select(m => m.Groups[1].Value).Where(h => !h.StartsWith('#') && !h.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase)).ToList();
        var external = links.Count(h => Uri.TryCreate(h, UriKind.Absolute, out var u) && u.Host != url.Host);
        items.Add(new("links", "page", "Liên kết", links.Count > 0 ? "pass" : "warning", "{0} liên kết nội bộ, {1} liên kết ngoài", null, [(links.Count - external).ToString(), external.ToString()]));
        var text = Tags().Replace(Regex.Replace(html, @"<(script|style)[^>]*>.*?</\1>", " ", RegexOptions.IgnoreCase | RegexOptions.Singleline), " ");
        var words = Words().Matches(WebUtility.HtmlDecode(text)).Count;
        items.Add(new("words", "page", "Số từ", words >= 300 ? "pass" : "warning", words >= 300 ? "{0} từ" : "{0} từ — nội dung ít", null, [words.ToString()]));
        var favicon = LinkTags().Matches(html).Any(m => Attr(m.Value, "rel").Contains("icon", StringComparison.OrdinalIgnoreCase));
        items.Add(new("favicon", "page", "Favicon", favicon ? "pass" : "warning", favicon ? "Có favicon" : "Không khai báo favicon"));
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
