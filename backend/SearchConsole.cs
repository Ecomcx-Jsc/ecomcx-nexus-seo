using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Cms.Plugin.Sdk;
using Cms.Plugin.Sdk.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace EcomcxSeo;

/// <summary>
/// Google Search Console qua tài khoản dịch vụ (service account): lượt nhấp, hiển thị, CTR, vị trí theo ngày / trang / từ khoá.
/// Cách bật: tạo service account trong Google Cloud, tải khoá JSON, thêm email của nó làm người dùng (quyền xem) trong Search Console,
/// dán khoá JSON + property ("sc-domain:example.com" hoặc "https://example.com/") ở SEO › Cài đặt › Phân tích.
/// </summary>
public static class SearchConsole
{
    private const string Scope = "https://www.googleapis.com/auth/webmasters.readonly";
    private static readonly ConcurrentDictionary<string, (DateTimeOffset Exp, string Token)> Tokens = new();
    private static readonly ConcurrentDictionary<string, (DateTimeOffset Exp, JsonNode Data)> Cache = new();

    private sealed record Account(string ClientEmail, string PrivateKey, string TokenUri);

    public static void Register(IPluginContext ctx)
    {
        ctx.Endpoints.Map(r =>
        {
            r.MapGet("/analytics/status", async (IOptionStore options, CancellationToken ct) =>
            {
                var (acc, property, error) = await ConfigAsync(options, ct);
                return Results.Ok(new { configured = error is null, error, property, clientEmail = acc?.ClientEmail });
            }).RequireCapability(Caps.Analysis);

            // Tổng quan + chuỗi theo ngày
            r.MapGet("/analytics/summary", (int? days, IOptionStore options, IHttpClientFactory http, CancellationToken ct) =>
                QueryAsync(options, http, Range(days), ["date"], null, 500, ct, rows => new JsonObject
                {
                    ["totals"] = Totals(rows),
                    ["daily"] = new JsonArray(rows.Select(x => (JsonNode)new JsonObject
                    {
                        ["date"] = x["keys"]?[0]?.DeepClone(), ["clicks"] = x["clicks"]?.DeepClone(), ["impressions"] = x["impressions"]?.DeepClone(),
                        ["ctr"] = x["ctr"]?.DeepClone(), ["position"] = x["position"]?.DeepClone(),
                    }).ToArray()),
                })).RequireCapability(Caps.Analysis);

            // Trang / từ khoá hàng đầu
            r.MapGet("/analytics/top", (string? dim, int? days, int? limit, string? page, IOptionStore options, IHttpClientFactory http, CancellationToken ct) =>
            {
                var dimension = dim == "query" ? "query" : "page";
                var filter = string.IsNullOrWhiteSpace(page) ? null : new { dimension = "page", @operator = "contains", expression = page };
                return QueryAsync(options, http, Range(days), [dimension], filter, Math.Clamp(limit ?? 50, 1, 1000), ct,
                    rows => new JsonObject { ["rows"] = new JsonArray(rows.Select(x => (JsonNode)Row(x)).ToArray()) });
            }).RequireCapability(Caps.Analysis);

            // Thứ hạng một từ khoá theo ngày
            r.MapGet("/analytics/keyword", (string q, int? days, IOptionStore options, IHttpClientFactory http, CancellationToken ct) =>
                QueryAsync(options, http, Range(days), ["date"], new { dimension = "query", @operator = "equals", expression = q.Trim().ToLowerInvariant() }, 500, ct,
                    rows => new JsonObject
                    {
                        ["keyword"] = q, ["totals"] = Totals(rows),
                        ["daily"] = new JsonArray(rows.Select(x => (JsonNode)new JsonObject { ["date"] = x["keys"]?[0]?.DeepClone(), ["position"] = x["position"]?.DeepClone(), ["clicks"] = x["clicks"]?.DeepClone() }).ToArray()),
                    })).RequireCapability(Caps.Analysis);
        });
    }

    private static (string Start, string End) Range(int? days)
    {
        // Search Console có độ trễ ~2 ngày
        var end = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-2);
        return (end.AddDays(-(Math.Clamp(days ?? 28, 7, 480) - 1)).ToString("yyyy-MM-dd"), end.ToString("yyyy-MM-dd"));
    }

    private static JsonObject Row(JsonNode x) => new()
    {
        ["key"] = x["keys"]?[0]?.DeepClone(), ["clicks"] = x["clicks"]?.DeepClone(), ["impressions"] = x["impressions"]?.DeepClone(),
        ["ctr"] = x["ctr"]?.DeepClone(), ["position"] = x["position"]?.DeepClone(),
    };

    private static JsonObject Totals(List<JsonNode> rows)
    {
        double clicks = rows.Sum(x => x["clicks"]?.GetValue<double>() ?? 0), impressions = rows.Sum(x => x["impressions"]?.GetValue<double>() ?? 0);
        // Vị trí trung bình có trọng số theo lượt hiển thị
        var position = impressions > 0 ? rows.Sum(x => (x["position"]?.GetValue<double>() ?? 0) * (x["impressions"]?.GetValue<double>() ?? 0)) / impressions : 0;
        return new JsonObject { ["clicks"] = clicks, ["impressions"] = impressions, ["ctr"] = impressions > 0 ? clicks / impressions : 0, ["position"] = Math.Round(position, 1) };
    }

    private static async Task<IResult> QueryAsync(IOptionStore options, IHttpClientFactory http, (string Start, string End) range, string[] dims, object? filter, int limit,
        CancellationToken ct, Func<List<JsonNode>, JsonObject> shape)
    {
        var (acc, property, error) = await ConfigAsync(options, ct);
        if (error is not null) return Results.Json(new { title = error }, statusCode: 412);
        var key = $"{property}|{range}|{string.Join(",", dims)}|{JsonSerializer.Serialize(filter)}|{limit}";
        if (Cache.TryGetValue(key, out var hit) && hit.Exp > DateTimeOffset.UtcNow) return Results.Ok(hit.Data);
        try
        {
            var token = await TokenAsync(http, acc!, ct);
            var client = http.CreateClient("ecx-seo");
            using var req = new HttpRequestMessage(HttpMethod.Post, $"https://searchconsole.googleapis.com/webmasters/v3/sites/{Uri.EscapeDataString(property!)}/searchAnalytics/query")
            {
                Content = JsonContent.Create(new { startDate = range.Start, endDate = range.End, dimensions = dims, rowLimit = limit, dimensionFilterGroups = filter is null ? null : new[] { new { filters = new[] { filter } } } }),
            };
            req.Headers.Authorization = new("Bearer", token);
            using var res = await client.SendAsync(req, ct);
            var body = await res.Content.ReadFromJsonAsync<JsonNode>(ct);
            if (!res.IsSuccessStatusCode)
                return Results.Json(new { title = "Search Console từ chối yêu cầu", errors = new { google = new[] { body?["error"]?["message"]?.ToString() ?? $"HTTP {(int)res.StatusCode}" } } }, statusCode: 502);
            var rows = (body?["rows"] as JsonArray)?.Where(x => x is not null).Select(x => x!).ToList() ?? [];
            var data = shape(rows);
            data["range"] = new JsonObject { ["start"] = range.Start, ["end"] = range.End };
            Cache[key] = (DateTimeOffset.UtcNow.AddMinutes(30), data);
            return Results.Ok(data);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or CryptographicException or JsonException)
        {
            return Results.Json(new { title = "Không kết nối hoặc xác thực được với Google", errors = new { google = new[] { e.Message } } }, statusCode: 502);
        }
    }

    private static async Task<(Account? Acc, string? Property, string? Error)> ConfigAsync(IOptionStore options, CancellationToken ct)
    {
        var s = await SeoSettings.LoadAsync(options, ct);
        var raw = SeoSettings.Str(s["analytics"]?["serviceAccount"]);
        var property = SeoSettings.Str(s["analytics"]?["searchConsoleProperty"]).Trim();
        if (raw.Length == 0 || property.Length == 0) return (null, null, "Chưa kết nối Search Console (SEO › Cài đặt › Phân tích)");
        try
        {
            var j = JsonNode.Parse(raw)!;
            var acc = new Account(j["client_email"]!.ToString(), j["private_key"]!.ToString(), j["token_uri"]?.ToString() ?? "https://oauth2.googleapis.com/token");
            // Khoá phải đọc được; token_uri chỉ được trỏ tới Google (không để cấu hình gửi khoá đi nơi khác)
            using (var rsa = System.Security.Cryptography.RSA.Create()) rsa.ImportFromPem(acc.PrivateKey);
            if (!Uri.TryCreate(acc.TokenUri, UriKind.Absolute, out var tu) || tu.Scheme != "https" || !tu.Host.EndsWith(".googleapis.com", StringComparison.OrdinalIgnoreCase))
                return (null, property, "Khoá JSON của tài khoản dịch vụ không hợp lệ");
            return (acc, property, null);
        }
        catch { return (null, property, "Khoá JSON của tài khoản dịch vụ không hợp lệ"); }
    }

    /// <summary>Đổi JWT ký bằng khoá riêng của service account lấy access token (cache tới khi gần hết hạn).</summary>
    private static async Task<string> TokenAsync(IHttpClientFactory http, Account acc, CancellationToken ct)
    {
        if (Tokens.TryGetValue(acc.ClientEmail, out var t) && t.Exp > DateTimeOffset.UtcNow.AddMinutes(2)) return t.Token;
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        static string B64(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var header = B64(Encoding.UTF8.GetBytes("""{"alg":"RS256","typ":"JWT"}"""));
        var claims = B64(JsonSerializer.SerializeToUtf8Bytes(new { iss = acc.ClientEmail, scope = Scope, aud = acc.TokenUri, iat = now, exp = now + 3600 }));
        using var rsa = RSA.Create();
        rsa.ImportFromPem(acc.PrivateKey);
        var signature = B64(rsa.SignData(Encoding.ASCII.GetBytes($"{header}.{claims}"), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
        var client = http.CreateClient("ecx-seo");
        using var res = await client.PostAsync(acc.TokenUri, new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer", ["assertion"] = $"{header}.{claims}.{signature}",
        }), ct);
        var body = await res.Content.ReadFromJsonAsync<JsonNode>(ct);
        if (!res.IsSuccessStatusCode || body?["access_token"] is null)
            throw new HttpRequestException(body?["error_description"]?.ToString() ?? body?["error"]?.ToString() ?? $"HTTP {(int)res.StatusCode}");
        var token = body["access_token"]!.ToString();
        Tokens[acc.ClientEmail] = (DateTimeOffset.UtcNow.AddSeconds(body["expires_in"]?.GetValue<int>() ?? 3600), token);
        return token;
    }
}
