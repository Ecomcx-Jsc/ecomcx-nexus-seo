using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cms.Plugin.Sdk;
using Cms.Plugin.Sdk.Contracts;
using Cms.Plugin.Sdk.Hooks;
using Cms.Plugin.Sdk.Services;
using Microsoft.Extensions.DependencyInjection;

namespace EcomcxSeo;

/// <summary>Dữ liệu SEO của bài viết, chuyên mục và website đưa ra cho phần website (extra.seo); SEO hình ảnh khi tải lên.</summary>
public static partial class SeoMeta
{
    /// <summary>Meta lưu cùng bài/chuyên mục (ẩn khỏi API công khai vì bắt đầu bằng "_").</summary>
    public const string MetaKey = "_ecx_seo";
    /// <summary>Khoá trong extra của post/term/site (riêng, không đụng plugin SEO khác).</summary>
    public const string ExtraKey = "ecxSeo";

    /// <summary>Các trường được phép đưa ra website. Từ khoá chính, điểm SEO, ghi chú… chỉ dùng trong admin.</summary>
    private static readonly string[] PublicKeys = ["title", "description", "canonical", "robots", "advancedRobots", "og", "twitter", "schemas", "breadcrumbTitle", "primaryTerm"];

    public static JsonObject PublicPart(JsonNode? meta)
    {
        var o = new JsonObject();
        if (meta is not JsonObject m) return o;
        foreach (var k in PublicKeys) if (m[k] is { } v) o[k] = v.DeepClone();
        return o;
    }

    public static void Register(IPluginContext ctx)
    {
        ctx.Filters.Add<PostDto>(FilterNames.ApiPostResponse, post =>
        {
            post.Extra[ExtraKey] = PublicPart(post.Meta[MetaKey]);
            return post;
        });

        ctx.Filters.Add<TermDto>(FilterNames.ApiTermResponse, term =>
        {
            term.Extra[ExtraKey] = PublicPart(term.Meta[MetaKey]);
            return term;
        });

        ctx.Filters.Add<SiteDto>(FilterNames.ApiSiteResponse, async (site, h) =>
        {
            var s = await SeoSettings.LoadAsync(h.Services.GetRequiredService<IOptionStore>(), h.CancellationToken);
            site.Extra[ExtraKey] = SeoSettings.ForPublic(s);
            return site;
        });

        // SEO hình ảnh: đặt alt/tiêu đề từ tên file ngay khi tải lên (chỉ khi người dùng chưa nhập)
        ctx.Filters.Add<MediaUploadInfo>(FilterNames.MediaUploading, async (info, h) =>
        {
            if (!info.MimeType.StartsWith("image/")) return info;
            var s = await SeoSettings.LoadAsync(h.Services.GetRequiredService<IOptionStore>(), h.CancellationToken);
            if (!SeoSettings.Bool(s["modules"]?["imageSeo"], true) || !SeoSettings.Bool(s["imageSeo"]?["onUpload"], true)) return info;
            var img = s["imageSeo"]!;
            var name = PrettyName(info.FileName);
            var caseChange = SeoSettings.Str(img["caseChange"], "none");
            if (string.IsNullOrWhiteSpace(info.Alt) && SeoSettings.Bool(img["addMissingAlt"], true))
                info.Alt = ChangeCase(Fill(SeoSettings.Str(img["altFormat"], "%filename%"), name), caseChange);
            if (SeoSettings.Bool(img["addMissingTitle"], true))
                info.Title = ChangeCase(Fill(SeoSettings.Str(img["titleFormat"], "%title%"), name), caseChange);
            return info;
        });
    }

    /// <summary>"anh-bia_san-pham-2026.jpg" → "anh bia san pham 2026".</summary>
    public static string PrettyName(string fileName)
    {
        var n = Path.GetFileNameWithoutExtension(fileName);
        n = DashOrUnderscore().Replace(n, " ");
        return MultiSpace().Replace(n, " ").Trim();
    }

    private static string Fill(string format, string name) =>
        MultiSpace().Replace(format.Replace("%filename%", name).Replace("%title%", name).Replace("%count(title)%", ""), " ").Trim();

    public static string ChangeCase(string s, string mode) => mode switch
    {
        "title" => CultureInfo.GetCultureInfo("vi-VN").TextInfo.ToTitleCase(s.ToLowerInvariant()),
        "sentence" => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s[1..].ToLowerInvariant(),
        "lower" => s.ToLowerInvariant(),
        "upper" => s.ToUpperInvariant(),
        _ => s,
    };

    [GeneratedRegex("[-_]+")] private static partial Regex DashOrUnderscore();
    [GeneratedRegex(@"\s{2,}")] private static partial Regex MultiSpace();
}
