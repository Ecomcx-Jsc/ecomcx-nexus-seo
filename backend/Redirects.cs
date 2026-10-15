using System.Data.Common;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cms.Plugin.Sdk;
using Cms.Plugin.Sdk.Contracts;
using Cms.Plugin.Sdk.Hooks;
using Cms.Plugin.Sdk.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace EcomcxSeo;

public sealed record RedirectSource(string Pattern, string Comparison = "exact", bool IgnoreCase = true);
public sealed record RedirectInput(List<RedirectSource> Sources, string? Target, int Type = 301, string Status = "active", string? Notes = null);
public sealed record RedirectRow(long Id, List<RedirectSource> Sources, string Target, int Type, string Status, long Hits, bool IsAuto, string? Notes,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? LastAccessedAt);
public sealed record BulkInput(string Action, List<long> Ids);
public sealed record PathInput(string Path);
public sealed record ImportInput(string? Csv);

/// <summary>
/// Chuyển hướng: mỗi quy tắc có nhiều nguồn (khớp chính xác / chứa / bắt đầu / kết thúc / regex), đích, mã 301/302/307/410/451.
/// Quy tắc đang bật được giữ trong bộ nhớ (làm mới khi sửa và mỗi 30 giây) → không truy vấn DB cho mỗi lượt xem trang.
/// </summary>
public static class Redirects
{
    public const string Table = "ecx_seo_redirects";
    public static readonly int[] Types = [301, 302, 307, 410, 451];
    /// <summary>410/451 không chuyển đi đâu: trang trả "không tìm thấy" (Next.js chưa hỗ trợ mã 410 cho trang).</summary>
    public const string GonePath = "/__ecx-seo-gone__";

    private sealed record Rule(long Id, List<(RedirectSource Src, Regex? Re)> Sources, string Target, int Type);
    private static volatile List<Rule>? _rules;
    private static DateTimeOffset _loadedAt;
    private static readonly SemaphoreSlim LoadLock = new(1, 1);
    public static void Invalidate() => _rules = null;

    /// <summary>Quy tắc đổi → bỏ bộ nhớ đệm ở API và báo website làm mới kết quả phân giải đường dẫn (cache theo tag "posts").</summary>
    public static Task ChangedAsync(IHookBus hooks, CancellationToken ct)
    {
        Invalidate();
        return hooks.DoAsync(HookNames.ContentChanged, new ContentChangedEvent(["posts"]), ct);
    }

    public static void Register(IPluginContext ctx)
    {
        ctx.Migrations.Add("001_redirects", $"""
            create table if not exists {Table} (
                id bigserial primary key,
                sources jsonb not null default '[]',
                target text not null default '',
                type int not null default 301,
                status text not null default 'active',
                hits bigint not null default 0,
                is_auto boolean not null default false,
                notes text,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now(),
                last_accessed_at timestamptz
            );
            create index if not exists ix_{Table}_status on {Table} (status);
            """, $"drop table if exists {Table}");

        // Chạy trước khi CMS phân giải URL
        ctx.Filters.Add<ResolveRequest>(FilterNames.ResolveRequest, async (req, h) =>
        {
            var s = await SeoSettings.LoadAsync(h.Services.GetRequiredService<IOptionStore>(), h.CancellationToken);
            if (!SeoSettings.Bool(s["modules"]?["redirections"], true)) return req;
            var db = h.Services.GetRequiredService<IDbConnectionFactory>();
            var match = Match(await RulesAsync(db, h.CancellationToken), req.Path);
            if (match is null) return req;
            var (rule, target) = match.Value;
            _ = CountHitAsync(db, rule.Id);
            if (rule.Type is 410 or 451) { req.Path = GonePath; return req; }
            if (SeoSettings.Bool(s["redirections"]?["keepQuery"], true) && req.Query.Count > 0 && !target.Contains('?'))
                target += "?" + string.Join("&", req.Query.Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}"));
            req.Redirect = new RedirectResult(target, rule.Type);
            return req;
        }, priority: 1);

        // Đổi đường dẫn bài đã đăng → tự tạo chuyển hướng 301 từ link cũ
        ctx.Hooks.On<PostEvent>(HookNames.PostSaved, async (e, h) =>
        {
            if (e.Previous is null || e.Previous.Status != "publish" || e.Post.Status != "publish") return;
            if (e.Previous.Link == e.Post.Link || Normalize(e.Previous.Link) == "/") return;
            var s = await SeoSettings.LoadAsync(h.Services.GetRequiredService<IOptionStore>(), h.CancellationToken);
            if (!SeoSettings.Bool(s["modules"]?["redirections"], true) || !SeoSettings.Bool(s["redirections"]?["autoOnSlugChange"], true)) return;
            var db = h.Services.GetRequiredService<IDbConnectionFactory>();
            await using var conn = await db.OpenAsync(h.CancellationToken);
            var oldPath = Normalize(e.Previous.Link);
            var newPath = Normalize(e.Post.Link);
            // Tránh vòng lặp: bỏ quy tắc tự động đang chuyển từ link mới
            await Db.ExecAsync(conn, $"delete from {Table} where is_auto and sources @> @src::jsonb", h.CancellationToken,
                ("src", JsonSerializer.Serialize(new[] { new { pattern = newPath } })));
            // Quy tắc tự động cũ trỏ tới link cũ → trỏ thẳng tới link mới (không tạo chuỗi chuyển hướng)
            await Db.ExecAsync(conn, $"update {Table} set target = @n, updated_at = now() where is_auto and target = @o", h.CancellationToken, ("n", newPath), ("o", oldPath));
            var exists = await Db.ScalarAsync<long>(conn, $"select count(*) from {Table} where sources @> @src::jsonb", h.CancellationToken,
                ("src", JsonSerializer.Serialize(new[] { new { pattern = oldPath } })));
            if (exists == 0)
                await Db.ExecAsync(conn, $"insert into {Table} (sources, target, type, is_auto, notes) values (@s::jsonb, @t, 301, true, @n)", h.CancellationToken,
                    ("s", JsonSerializer.Serialize(new[] { new RedirectSource(oldPath) }, SeoSettings.Json)), ("t", newPath), ("n", $"Tự tạo khi đổi đường dẫn bài #{e.Post.Id}"));
            Invalidate();
        });

        ctx.Endpoints.Map(r =>
        {
            r.MapGet("/redirects", async (string? search, string? status, int? page, IDbConnectionFactory db, CancellationToken ct) =>
            {
                var p = Math.Max(1, page ?? 1);
                var where = "where (@st = '' or status = @st) and (@q = '' or sources::text ilike @like or target ilike @like or coalesce(notes,'') ilike @like)";
                var args = new (string, object?)[] { ("st", status ?? ""), ("q", search ?? ""), ("like", $"%{search}%") };
                await using var conn = await db.OpenAsync(ct);
                var total = await Db.ScalarAsync<long>(conn, $"select count(*) from {Table} {where}", ct, args);
                var items = await Db.QueryAsync(conn, $"select {Cols} from {Table} {where} order by updated_at desc limit 50 offset @o", Read, ct, [.. args, ("o", (p - 1) * 50)]);
                var counts = await Db.QueryAsync(conn, $"select status, count(*) from {Table} group by status", r => (r.GetString(0), r.GetInt64(1)), ct);
                return Results.Ok(new { items, total, page = p, totalPages = (int)Math.Ceiling(total / 50.0), counts = counts.ToDictionary(x => x.Item1, x => x.Item2) });
            }).RequireCapability(Caps.Redirects);

            r.MapPost("/redirects", async (RedirectInput input, IDbConnectionFactory db, IHookBus hooks, CancellationToken ct) =>
            {
                if (Validate(input) is { } err) return err;
                await using var conn = await db.OpenAsync(ct);
                var id = await Db.ScalarAsync<long>(conn, $"insert into {Table} (sources, target, type, status, notes) values (@s::jsonb, @t, @ty, @st, @n) returning id", ct,
                    ("s", SourcesJson(input)), ("t", input.Target?.Trim() ?? ""), ("ty", input.Type), ("st", input.Status), ("n", input.Notes));
                await ChangedAsync(hooks, ct);
                return Results.Ok(new { id });
            }).RequireCapability(Caps.Redirects);

            r.MapPut("/redirects/{id:long}", async (long id, RedirectInput input, IDbConnectionFactory db, IHookBus hooks, CancellationToken ct) =>
            {
                if (Validate(input) is { } err) return err;
                await using var conn = await db.OpenAsync(ct);
                var n = await Db.ExecAsync(conn, $"update {Table} set sources = @s::jsonb, target = @t, type = @ty, status = @st, notes = @n, updated_at = now() where id = @id", ct,
                    ("s", SourcesJson(input)), ("t", input.Target?.Trim() ?? ""), ("ty", input.Type), ("st", input.Status), ("n", input.Notes), ("id", id));
                await ChangedAsync(hooks, ct);
                return n == 0 ? Results.NotFound() : Results.NoContent();
            }).RequireCapability(Caps.Redirects);

            r.MapDelete("/redirects/{id:long}", async (long id, IDbConnectionFactory db, IHookBus hooks, CancellationToken ct) =>
            {
                await using var conn = await db.OpenAsync(ct);
                await Db.ExecAsync(conn, $"delete from {Table} where id = @id", ct, ("id", id));
                await ChangedAsync(hooks, ct);
                return Results.NoContent();
            }).RequireCapability(Caps.Redirects);

            r.MapPost("/redirects/bulk", async (BulkInput input, IDbConnectionFactory db, IHookBus hooks, CancellationToken ct) =>
            {
                var ids = input.Ids.Take(1000).ToArray();
                await using var conn = await db.OpenAsync(ct);
                var sql = input.Action switch
                {
                    "activate" => $"update {Table} set status = 'active', updated_at = now() where id = any(@ids)",
                    "deactivate" => $"update {Table} set status = 'inactive', updated_at = now() where id = any(@ids)",
                    "delete" => $"delete from {Table} where id = any(@ids)",
                    "reset" => $"update {Table} set hits = 0, last_accessed_at = null where id = any(@ids)",
                    _ => null,
                };
                if (sql is null) return Results.BadRequest();
                var n = await Db.ExecAsync(conn, sql, ct, ("ids", ids));
                await ChangedAsync(hooks, ct);
                return Results.Ok(new { affected = n });
            }).RequireCapability(Caps.Redirects);

            // Kiểm tra một đường dẫn sẽ được chuyển hướng tới đâu
            r.MapPost("/redirects/test", async (PathInput input, IDbConnectionFactory db, CancellationToken ct) =>
            {
                var m = Match(await RulesAsync(db, ct, force: true), input.Path ?? "/");
                return Results.Ok(m is null ? new { matched = false, id = (long?)null, target = (string?)null, type = (int?)null }
                    : new { matched = true, id = (long?)m.Value.Rule.Id, target = (string?)m.Value.Target, type = (int?)m.Value.Rule.Type });
            }).RequireCapability(Caps.Redirects);

            // CSV: nguồn,đích,mã,kiểu khớp
            r.MapGet("/redirects/export", async (IDbConnectionFactory db, CancellationToken ct) =>
            {
                await using var conn = await db.OpenAsync(ct);
                var rows = await Db.QueryAsync(conn, $"select {Cols} from {Table} order by id", Read, ct);
                var sb = new StringBuilder("source,target,type,comparison,status\n");
                foreach (var row in rows)
                    foreach (var src in row.Sources)
                        sb.Append(Csv(src.Pattern)).Append(',').Append(Csv(row.Target)).Append(',').Append(row.Type).Append(',').Append(src.Comparison).Append(',').Append(row.Status).Append('\n');
                return Results.Ok(new { csv = sb.ToString(), count = rows.Count });
            }).RequireCapability(Caps.Redirects);

            r.MapPost("/redirects/import", async (ImportInput body, IDbConnectionFactory db, IHookBus hooks, CancellationToken ct) =>
            {
                var text = body.Csv ?? "";
                if (text.Length > 5_000_000) return Results.Json(new { title = "File quá lớn (tối đa 5MB)" }, statusCode: 413);
                int added = 0, skipped = 0;
                await using var conn = await db.OpenAsync(ct);
                foreach (var line in text.Split('\n').Select(l => l.TrimEnd('\r')).Where(l => l.Length > 0))
                {
                    var cols = ParseCsvLine(line);
                    if (cols.Count < 2 || cols[0].Equals("source", StringComparison.OrdinalIgnoreCase)) { skipped++; continue; }
                    var type = cols.Count > 2 && int.TryParse(cols[2], out var t) && Types.Contains(t) ? t : 301;
                    var cmp = cols.Count > 3 && ComparisonOk(cols[3]) ? cols[3] : "exact";
                    var input = new RedirectInput([new RedirectSource(cols[0], cmp)], cols[1], type, cols.Count > 4 && cols[4] == "inactive" ? "inactive" : "active");
                    if (Validate(input) is not null) { skipped++; continue; }
                    await Db.ExecAsync(conn, $"insert into {Table} (sources, target, type, status) values (@s::jsonb, @t, @ty, @st)", ct,
                        ("s", SourcesJson(input)), ("t", input.Target?.Trim() ?? ""), ("ty", input.Type), ("st", input.Status));
                    added++;
                }
                await ChangedAsync(hooks, ct);
                return Results.Ok(new { added, skipped });
            }).RequireCapability(Caps.Redirects);
        });
    }

    private const string Cols = "id, sources, target, type, status, hits, is_auto, notes, created_at, updated_at, last_accessed_at";
    private static RedirectRow Read(DbDataReader r) => new(r.GetInt64(0), JsonSerializer.Deserialize<List<RedirectSource>>(r.GetString(1), SeoSettings.Json) ?? [],
        r.GetString(2), r.GetInt32(3), r.GetString(4), r.GetInt64(5), r.GetBoolean(6), r.Str(7), r.GetFieldValue<DateTimeOffset>(8), r.GetFieldValue<DateTimeOffset>(9), r.Time(10));

    private static string SourcesJson(RedirectInput input) => JsonSerializer.Serialize(
        input.Sources.Select(s => s with { Pattern = s.Comparison == "regex" ? s.Pattern.Trim() : Normalize(s.Pattern) }), SeoSettings.Json);

    private static bool ComparisonOk(string c) => c is "exact" or "contains" or "start" or "end" or "regex";

    private static IResult? Validate(RedirectInput input)
    {
        var errors = new Dictionary<string, string[]>();
        if (input.Sources is null || input.Sources.Count == 0 || input.Sources.Any(s => string.IsNullOrWhiteSpace(s.Pattern) || s.Pattern.Length > 2000))
            errors["sources"] = ["Nhập ít nhất một đường dẫn nguồn"];
        else if (input.Sources.Any(s => !ComparisonOk(s.Comparison)))
            errors["sources"] = ["Kiểu khớp không hợp lệ"];
        else
            foreach (var s in input.Sources.Where(s => s.Comparison == "regex"))
                try { _ = new Regex(s.Pattern, RegexOptions.None, TimeSpan.FromMilliseconds(100)); }
                catch (ArgumentException) { errors["sources"] = ["Biểu thức chính quy không hợp lệ", s.Pattern]; }
        if (!Types.Contains(input.Type)) errors["type"] = ["Mã chuyển hướng phải là 301, 302, 307, 410 hoặc 451"];
        var target = input.Target?.Trim() ?? "";
        if (input.Type is not (410 or 451))
        {
            if (target.Length == 0) errors["target"] = ["Nhập đích chuyển hướng"];
            else if (!target.StartsWith('/') && !Uri.TryCreate(target, UriKind.Absolute, out _)) errors["target"] = ["Đích phải là đường dẫn trong website (/bai-moi) hoặc URL đầy đủ"];
            else if (input.Sources?.Any(s => s.Comparison == "exact" && Normalize(s.Pattern) == Normalize(target)) == true) errors["target"] = ["Nguồn và đích trùng nhau"];
        }
        if (input.Status is not ("active" or "inactive")) errors["status"] = ["Trạng thái không hợp lệ"];
        return errors.Count > 0 ? Results.Json(new { title = "Dữ liệu không hợp lệ", errors }, statusCode: 422) : null;
    }

    /// <summary>"/Bai-Viet/?x" → "/bai-viet" (bỏ query, dấu "/" cuối; giữ nguyên chữ hoa/thường để so sánh có tuỳ chọn).</summary>
    public static string Normalize(string path)
    {
        var p = path.Trim();
        if (Uri.TryCreate(p, UriKind.Absolute, out var abs) && abs.Scheme.StartsWith("http")) p = abs.AbsolutePath;
        p = p.Split('?', '#')[0];
        try { p = Uri.UnescapeDataString(p); } catch { /* giữ nguyên */ }
        if (!p.StartsWith('/')) p = "/" + p;
        return p.Length > 1 ? p.TrimEnd('/') : p;
    }

    private static async Task<List<Rule>> RulesAsync(IDbConnectionFactory db, CancellationToken ct, bool force = false)
    {
        var cached = _rules;
        if (!force && cached is not null && DateTimeOffset.UtcNow - _loadedAt < TimeSpan.FromSeconds(30)) return cached;
        await LoadLock.WaitAsync(ct);
        try
        {
            if (!force && _rules is { } again && DateTimeOffset.UtcNow - _loadedAt < TimeSpan.FromSeconds(30)) return again;
            await using var conn = await db.OpenAsync(ct);
            var rows = await Db.QueryAsync(conn, $"select {Cols} from {Table} where status = 'active' order by id", Read, ct);
            var rules = rows.Select(r => new Rule(r.Id, r.Sources.Select(s => (s, s.Comparison == "regex"
                ? TryRegex(s.Pattern, s.IgnoreCase) : null)).ToList(), r.Target, r.Type)).ToList();
            _rules = rules;
            _loadedAt = DateTimeOffset.UtcNow;
            return rules;
        }
        finally { LoadLock.Release(); }
    }

    private static Regex? TryRegex(string pattern, bool ignoreCase)
    {
        try { return new Regex(pattern, (ignoreCase ? RegexOptions.IgnoreCase : RegexOptions.None) | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50)); }
        catch (ArgumentException) { return null; }
    }

    private static (Rule Rule, string Target)? Match(List<Rule> rules, string rawPath)
    {
        var path = Normalize(rawPath);
        foreach (var rule in rules)
            foreach (var (src, re) in rule.Sources)
            {
                var cmp = src.IgnoreCase ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
                switch (src.Comparison)
                {
                    case "exact" when string.Equals(path, src.Pattern, cmp):
                    case "contains" when path.Contains(src.Pattern, cmp):
                    case "start" when path.StartsWith(src.Pattern, cmp):
                    case "end" when path.EndsWith(src.Pattern, cmp):
                        return (rule, rule.Target);
                    case "regex" when re is not null:
                        try
                        {
                            var m = re.Match(path);
                            // Đích có thể dùng $1, $2… lấy từ nhóm của regex
                            if (m.Success) return (rule, rule.Target.Contains('$') ? m.Result(rule.Target) : rule.Target);
                        }
                        catch (RegexMatchTimeoutException) { /* regex chạy quá lâu → bỏ qua quy tắc */ }
                        break;
                }
            }
        return null;
    }

    /// <summary>Đường dẫn bị quy tắc 410/451 xử lý (để theo dõi 404 không ghi nhận nhầm).</summary>
    public static async Task<bool> IsGoneAsync(IDbConnectionFactory db, string path, CancellationToken ct) =>
        Match(await RulesAsync(db, ct), path) is { Rule.Type: 410 or 451 };

    private static async Task CountHitAsync(IDbConnectionFactory db, long id)
    {
        try
        {
            await using var conn = await db.OpenAsync(CancellationToken.None);
            await Db.ExecAsync(conn, $"update {Table} set hits = hits + 1, last_accessed_at = now() where id = @id", CancellationToken.None, ("id", id));
        }
        catch { /* đếm lượt không được thì bỏ qua, không ảnh hưởng chuyển hướng */ }
    }

    private static string Csv(string v) => v.IndexOfAny([',', '"', '\n']) >= 0 ? $"\"{v.Replace("\"", "\"\"")}\"" : v;

    private static List<string> ParseCsvLine(string line)
    {
        var cols = new List<string>();
        var sb = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < line.Length && line[i + 1] == '"') { sb.Append('"'); i++; }
                else if (c == '"') quoted = false;
                else sb.Append(c);
            }
            else if (c == '"') quoted = true;
            else if (c == ',') { cols.Add(sb.ToString().Trim()); sb.Clear(); }
            else sb.Append(c);
        }
        cols.Add(sb.ToString().Trim());
        return cols;
    }
}
