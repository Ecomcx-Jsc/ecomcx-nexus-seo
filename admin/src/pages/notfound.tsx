import { useState } from "react";
import { __, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, api, can, notify, useApi } from "@cms/admin-sdk";
import { API, Hint, Icon, Loading } from "../ui";
import { TYPES, errorText } from "./redirects";

interface Row { id: number; uri: string; hits: number; referer?: string | null; userAgent?: string | null; ip?: string | null; firstSeen: string; lastSeen: string }
interface ListResult { items: Row[]; total: number; hits: number; today: number; page: number; totalPages: number }

export function NotFoundPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [redirectFor, setRedirectFor] = useState<number[] | null>(null);
  const [target, setTarget] = useState("");
  const [type, setType] = useState("301");
  const [busy, setBusy] = useState(false);
  const { data, reload } = useApi<ListResult>(`${API}/404?sort=${sort}&search=${encodeURIComponent(q)}&page=${page}`);
  const { data: settings } = useApi<{ modules: Record<string, boolean>; monitor404?: { mode: string } }>(`${API}/settings`);
  const items = data?.items ?? [];
  const all = items.length > 0 && items.every((r) => selected.includes(r.id));
  const advanced = settings?.monitor404?.mode === "advanced";
  const canRedirect = can("ecx_seo_redirects");

  async function remove(ids: number[]) {
    if (!confirm(__("Xoá {0} dòng đã chọn?", ids.length))) return;
    await api.post(`${API}/404/delete`, { action: "delete", ids });
    setSelected([]); reload();
  }
  async function clear() {
    if (!confirm(__("Xoá toàn bộ nhật ký 404?"))) return;
    await api.post(`${API}/404/clear`); setSelected([]); reload();
  }
  async function createRedirect() {
    if (!redirectFor) return;
    setBusy(true);
    try {
      const r = await api.post<{ id: number; sources: number }>(`${API}/404/redirect`, { ids: redirectFor, target: target.trim(), type: Number(type) });
      notify.success(__("Đã tạo chuyển hướng cho {0} URL", r.sources));
      setRedirectFor(null); setTarget(""); setSelected([]); reload();
    } catch (e) { notify.error(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title={__("Theo dõi 404")} description={__("Đường dẫn người đọc hoặc máy tìm kiếm truy cập nhưng không tồn tại. Sửa liên kết hỏng hoặc chuyển hướng tới trang phù hợp.")}
        actions={items.length > 0 ? <Button variant="danger" onClick={clear}>{__("Xoá toàn bộ")}</Button> : undefined} />
      {settings && settings.modules?.monitor404 === false && <Hint tone="warn">{__("Module Theo dõi 404 đang tắt — bật lại ở Bảng điều khiển SEO để ghi nhận lỗi mới.")}</Hint>}
      {data && (
        <div className="ecx-grid-3" style={{ marginBottom: 16 }}>
          <div className="ecx-stat"><div className="ecx-stat-label">{__("URL lỗi")}</div><div className="ecx-stat-value">{data.total.toLocaleString()}</div></div>
          <div className="ecx-stat"><div className="ecx-stat-label">{__("Tổng lượt truy cập")}</div><div className="ecx-stat-value">{data.hits.toLocaleString()}</div></div>
          <div className="ecx-stat"><div className="ecx-stat-label">{__("Có lượt mới trong 24 giờ")}</div><div className="ecx-stat-value">{data.today.toLocaleString()}</div></div>
        </div>
      )}
      <Card>
        <div className="ecx-flex" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <Select style={{ width: 200 }} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}
            options={[{ value: "recent", label: __("Mới nhất") }, { value: "hits", label: __("Nhiều lượt nhất") }]} />
          <span className="ecx-spacer" />
          <Input style={{ width: 240 }} value={search} placeholder={__("Tìm URL hoặc trang dẫn tới…")} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setQ(search); setPage(1); } }} />
        </div>
        {selected.length > 0 && (
          <div className="ecx-flex" style={{ marginBottom: 10 }}>
            <span className="ecx-muted">{__("Đã chọn {0}", selected.length)}</span>
            {canRedirect && <Button size="sm" variant="secondary" onClick={() => setRedirectFor(selected)}>{__("Chuyển hướng")}</Button>}
            <Button size="sm" variant="danger" onClick={() => remove(selected)}>{__("Xoá")}</Button>
          </div>
        )}
        {!data ? <Loading /> : items.length === 0 ? (
          <EmptyState title={q ? __("Không tìm thấy") : __("Chưa ghi nhận lỗi 404 nào")} description={__("Website báo về mỗi khi có người truy cập đường dẫn không tồn tại.")} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ecx-table">
              <thead><tr>
                <th style={{ width: 32 }}><Checkbox checked={all} onChange={(v) => setSelected(v ? items.map((r) => r.id) : [])} /></th>
                <th>URL</th><th>{__("Trang dẫn tới")}</th>
                {advanced && <th>{__("Trình duyệt / IP")}</th>}
                <th className="num" style={{ width: 80 }}>{__("Lượt")}</th><th style={{ width: 160 }}>{__("Lần cuối")}</th><th style={{ width: 120 }} />
              </tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td><Checkbox checked={selected.includes(r.id)} onChange={(v) => setSelected(v ? [...selected, r.id] : selected.filter((x) => x !== r.id))} /></td>
                    <td><a className="ecx-link ecx-mono ecx-trunc" style={{ maxWidth: 360 }} href={r.uri} target="_blank" rel="noreferrer">{r.uri}</a></td>
                    <td>{r.referer ? <span className="ecx-muted ecx-trunc" style={{ maxWidth: 260 }} title={r.referer}>{r.referer}</span> : <span className="ecx-muted">—</span>}</td>
                    {advanced && <td><span className="ecx-muted ecx-trunc" style={{ maxWidth: 220 }} title={r.userAgent ?? ""}>{r.userAgent ?? "—"}</span>{r.ip && <Badge>{r.ip}</Badge>}</td>}
                    <td className="num">{r.hits.toLocaleString()}</td>
                    <td className="ecx-muted">{new Date(r.lastSeen).toLocaleString()}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {canRedirect && <Button size="sm" variant="ghost" onClick={() => setRedirectFor([r.id])}>{__("Chuyển hướng")}</Button>}
                      <Button size="sm" variant="ghost" onClick={() => remove([r.id])} aria-label={__("Xoá")}>{Icon.trash(14)}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.totalPages > 1 && (
          <div className="ecx-flex" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button>
            <span className="ecx-muted">{__("Trang {0}/{1}", page, data.totalPages)}</span>
            <Button size="sm" variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>›</Button>
          </div>
        )}
      </Card>

      <Modal open={!!redirectFor} title={__("Chuyển hướng {0} URL", redirectFor?.length ?? 0)} onClose={() => setRedirectFor(null)} width={560}
        footer={<><Button variant="secondary" onClick={() => setRedirectFor(null)}>{__("Huỷ")}</Button><Button variant="primary" loading={busy} onClick={createRedirect}>{__("Tạo chuyển hướng")}</Button></>}>
        <div className="ecx-grid">
          <Field label={__("Kiểu chuyển hướng")}><Select value={type} onChange={(e) => setType(e.target.value)} options={TYPES.map((t) => ({ ...t, label: __(t.label) }))} /></Field>
          {type !== "410" && type !== "451" && (
            <Field label={__("URL đích")} help={__("Đường dẫn trong website (/bai-moi) hoặc URL đầy đủ.")}><Input value={target} placeholder="/" onChange={(e) => setTarget(e.target.value)} /></Field>
          )}
          <p className="ecx-muted" style={{ margin: 0 }}>{__("Các URL đã chọn sẽ được xoá khỏi danh sách 404 sau khi tạo chuyển hướng.")}</p>
        </div>
      </Modal>
    </>
  );
}
