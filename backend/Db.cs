using System.Data.Common;

namespace EcomcxSeo;

/// <summary>Truy vấn SQL gọn (plugin chỉ có DbConnection thô từ CMS).</summary>
internal static class Db
{
    public static DbCommand Cmd(DbConnection conn, string sql, params (string Name, object? Value)[] args)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        foreach (var (name, value) in args)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }
        return cmd;
    }

    public static async Task<int> ExecAsync(DbConnection conn, string sql, CancellationToken ct, params (string, object?)[] args)
    {
        await using var cmd = Cmd(conn, sql, args);
        return await cmd.ExecuteNonQueryAsync(ct);
    }

    public static async Task<T?> ScalarAsync<T>(DbConnection conn, string sql, CancellationToken ct, params (string, object?)[] args)
    {
        await using var cmd = Cmd(conn, sql, args);
        var v = await cmd.ExecuteScalarAsync(ct);
        if (v is null or DBNull) return default;
        return (T)Convert.ChangeType(v, Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T));
    }

    public static async Task<List<T>> QueryAsync<T>(DbConnection conn, string sql, Func<DbDataReader, T> map, CancellationToken ct, params (string, object?)[] args)
    {
        await using var cmd = Cmd(conn, sql, args);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<T>();
        while (await r.ReadAsync(ct)) list.Add(map(r));
        return list;
    }

    public static string? Str(this DbDataReader r, int i) => r.IsDBNull(i) ? null : r.GetString(i);
    public static DateTimeOffset? Time(this DbDataReader r, int i) => r.IsDBNull(i) ? null : r.GetFieldValue<DateTimeOffset>(i);
}
