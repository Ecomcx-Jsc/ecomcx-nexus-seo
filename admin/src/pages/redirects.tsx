import { useRef, useState } from "react";
import { __, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea, api, notify, useApi } from "@cms/admin-sdk";
import { API, Icon, Loading } from "../ui";

export interface Source { pattern: string; comparison: string; ignoreCase: boolean }
interface Rule {
  id: number; sources: Source[]; target: string; type: number; status: string; hits: number; isAuto: boolean; notes?: string | null;
  createdAt: string; updatedAt: string; lastAccessedAt?: string | null;
}
interface ListResult { items: Rule[]; total: number; page: number; totalPages: number; counts: Record<string, number> }

export const COMPARISONS = [
  { value: "exact", label: "Khớp chính xác" }, { value: "contains", label: "Chứa" }, { value: "start", label: "Bắt đầu bằng" },
  { value: "end", label: "Kết thúc bằng" }, { value: "regex", label: "Biểu thức chính quy" },
];
export const TYPES = [
  { value: "301", label: "301 – Chuyển vĩnh viễn" }, { value: "302", label: "302 – Chuyển tạm thời" }, { value: "307", label: "307 – Chuyển tạm thời" },
  { value: "410", label: "410 – Đã xoá vĩnh viễn" }, { value: "451", label: "451 – Gỡ vì lý do pháp lý" },
];
const noTarget = (type: number) => type === 410 || type === 451;
/** Ghi chú do hệ thống tạo được dịch; ghi chú người dùng giữ nguyên. */
const noteText = (n: string) => { const m = n.match(/^Tự tạo khi đổi đường dẫn bài #(\d+)$/); return m ? __("Tự tạo khi đổi đường dẫn bài #{0}", m[1]) : __(n); };

/** Lỗi từ API (admin đã gộp và dịch thông báo của máy chủ). */
export const errorText = (e: unknown) => (e as Error).message;

export function RedirectModal({ rule, defaultType, onClose, onSaved }: { rule: Partial<Rule> | null; defaultType: number; onClose(): void; onSaved(): void }) {
  const [draft, setDraft] = useState<Partial<Rule>>(() => rule ?? {});
  const [saving, setSaving] = useState(false);
  const sources = draft.sources?.length ? draft.sources : [{ pattern: "", comparison: "exact", ignoreCase: true }];
  const type = draft.type ?? defaultType;
  const setSource = (i: number, patch: Partial<Source>) => setDraft({ ...draft, sources: sources.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  async function save() {
    setSaving(true);
    const body = { sources: sources.filter((s) => s.pattern.trim()), target: noTarget(type) ? "" : draft.target ?? "", type, status: draft.status ?? "active", notes: draft.notes || null };
    try {
      if (draft.id) await api.put(`${API}/redirects/${draft.id}`, body); else await api.post(`${API}/redirects`, body);
      notify.success(__("Đã lưu chuyển hướng"));
      onSaved();
    } catch (e) { notify.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open title={draft.id ? __("Sửa chuyển hướng") : __("Thêm chuyển hướng")} onClose={onClose} width={680}
      footer={<><Button variant="secondary" onClick={onClose}>{__("Huỷ")}</Button><Button variant="primary" loading={saving} onClick={save}>{__("Lưu")}</Button></>}>
      <div className="ecx-grid">
        <Field label={__("URL nguồn")} help={__("Đường dẫn trong website, vd /bai-cu. Có thể thêm nhiều nguồn cùng chuyển tới một đích.")}>
          <div className="ecx-grid" style={{ gap: 8 }}>
            {sources.map((s, i) => (
              <div key={i} className="ecx-flex" style={{ flexWrap: "nowrap" }}>
                <Input style={{ flex: 1 }} value={s.pattern} placeholder={s.comparison === "regex" ? "^/tin-tuc/(.*)$" : "/duong-dan-cu"} onChange={(e) => setSource(i, { pattern: e.target.value })} />
                <Select style={{ width: 170 }} value={s.comparison} onChange={(e) => setSource(i, { comparison: e.target.value })} options={COMPARISONS.map((c) => ({ ...c, label: __(c.label) }))} />
                <Button size="sm" variant="ghost" disabled={sources.length === 1} onClick={() => setDraft({ ...draft, sources: sources.filter((_, j) => j !== i) })} aria-label={__("Xoá")}>{Icon.trash(14)}</Button>
              </div>
            ))}
            <div><Button size="sm" variant="secondary" onClick={() => setDraft({ ...draft, sources: [...sources, { pattern: "", comparison: "exact", ignoreCase: true }] })}>{Icon.plus(14)} {__("Thêm nguồn")}</Button></div>
          </div>
        </Field>
        <Field label={__("Kiểu chuyển hướng")}>
          <Select value={String(type)} onChange={(e) => setDraft({ ...draft, type: Number(e.target.value) })} options={TYPES.map((t) => ({ ...t, label: __(t.label) }))} />
        </Field>
        {!noTarget(type) && (
          <Field label={__("URL đích")} help={sources.some((s) => s.comparison === "regex") ? __("Dùng $1, $2… để chèn phần khớp của biểu thức chính quy.") : __("Đường dẫn trong website (/bai-moi) hoặc URL đầy đủ.")}>
            <Input value={draft.target ?? ""} placeholder="/duong-dan-moi" onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
          </Field>
        )}
        <Field label={__("Ghi chú")}><Input value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
        <Checkbox checked={(draft.status ?? "active") === "active"} onChange={(v) => setDraft({ ...draft, status: v ? "active" : "inactive" })} label={__("Đang bật")} />
      </div>
    </Modal>
  );
}

function TestBox() {
  const [path, setPath] = useState("");
  const [result, setResult] = useState<{ matched: boolean; id?: number; target?: string; type?: number } | null>(null);
  async function run() {
    if (!path.trim()) return;
    try { setResult(await api.post(`${API}/redirects/test`, { path: path.trim() })); } catch (e) { notify.error(errorText(e)); }
  }
  return (
    <div className="ecx-flex" style={{ flexWrap: "wrap" }}>
      <Input style={{ width: 280 }} value={path} placeholder={__("Kiểm tra một đường dẫn, vd /bai-cu")} onChange={(e) => { setPath(e.target.value); setResult(null); }} onKeyDown={(e) => e.key === "Enter" && run()} />
      <Button variant="secondary" onClick={run}>{__("Kiểm tra")}</Button>
      {result && (result.matched
        ? <span style={{ color: "var(--app-success)", fontSize: 13 }}>{noTarget(result.type!) ? __("Khớp quy tắc #{0}: trả mã {1}", result.id, result.type) : __("Khớp quy tắc #{0}: {1} → {2}", result.id, result.type, result.target)}</span>
        : <span className="ecx-muted">{__("Không khớp quy tắc nào")}</span>)}
    </div>
  );
}

function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RedirectsPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, reload } = useApi<ListResult>(`${API}/redirects?status=${status}&search=${encodeURIComponent(q)}&page=${page}`);
  const { data: settings } = useApi<{ redirections?: { defaultType?: number } }>(`${API}/settings`);
  const defaultType = settings?.redirections?.defaultType ?? 301;
  const items = data?.items ?? [];
  const all = items.length > 0 && items.every((r) => selected.includes(r.id));

  async function bulk(action: string) {
    if (!selected.length) return;
    if (action === "delete" && !confirm(__("Xoá {0} chuyển hướng đã chọn?", selected.length))) return;
    try { const r = await api.post<{ affected: number }>(`${API}/redirects/bulk`, { action, ids: selected }); notify.success(__("Đã cập nhật {0} dòng", r.affected)); setSelected([]); reload(); }
    catch (e) { notify.error(errorText(e)); }
  }
  async function remove(id: number) {
    if (!confirm(__("Xoá chuyển hướng này?"))) return;
    await api.del(`${API}/redirects/${id}`); reload();
  }
  async function exportCsv() {
    const r = await api.get<{ csv: string; count: number }>(`${API}/redirects/export`);
    download(`redirects-${new Date().toISOString().slice(0, 10)}.csv`, r.csv);
  }
  async function importCsv() {
    try {
      const r = await api.post<{ added: number; skipped: number }>(`${API}/redirects/import`, { csv });
      notify.success(__("Đã nhập {0} chuyển hướng, bỏ qua {1} dòng", r.added, r.skipped));
      setShowImport(false); setCsv(""); reload();
    } catch (e) { notify.error(errorText(e)); }
  }
  const counts = data?.counts ?? {};
  const total = (counts.active ?? 0) + (counts.inactive ?? 0);

  return (
    <>
      <PageHeader title={__("Chuyển hướng")} description={__("Chuyển người đọc và máy tìm kiếm từ đường dẫn cũ sang đường dẫn mới, giữ thứ hạng khi đổi cấu trúc website.")}
        actions={<>
          <Button variant="secondary" onClick={() => setShowImport(true)}>{__("Nhập CSV")}</Button>
          <Button variant="secondary" onClick={exportCsv}>{__("Xuất CSV")}</Button>
          <Button variant="primary" onClick={() => setEditing({})}>{Icon.plus(14)} {__("Thêm chuyển hướng")}</Button>
        </>} />
      <Card>
        <div className="ecx-flex" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); setSelected([]); }}
            items={[{ value: "", label: __("Tất cả"), count: total }, { value: "active", label: __("Đang bật"), count: counts.active ?? 0 }, { value: "inactive", label: __("Đang tắt"), count: counts.inactive ?? 0 }]} />
          <span className="ecx-spacer" />
          <Input style={{ width: 240 }} value={search} placeholder={__("Tìm theo nguồn, đích, ghi chú…")} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setQ(search); setPage(1); } }} />
        </div>
        <div style={{ marginBottom: 12 }}><TestBox /></div>
        {selected.length > 0 && (
          <div className="ecx-flex" style={{ marginBottom: 10 }}>
            <span className="ecx-muted">{__("Đã chọn {0}", selected.length)}</span>
            <Button size="sm" variant="secondary" onClick={() => bulk("activate")}>{__("Bật")}</Button>
            <Button size="sm" variant="secondary" onClick={() => bulk("deactivate")}>{__("Tắt")}</Button>
            <Button size="sm" variant="secondary" onClick={() => bulk("reset")}>{__("Đặt lại lượt truy cập")}</Button>
            <Button size="sm" variant="danger" onClick={() => bulk("delete")}>{__("Xoá")}</Button>
          </div>
        )}
        {!data ? <Loading /> : items.length === 0 ? (
          <EmptyState title={q ? __("Không tìm thấy chuyển hướng") : __("Chưa có chuyển hướng")} description={__("Chuyển hướng được tự tạo khi bạn đổi đường dẫn của bài đã đăng.")} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ecx-table">
              <thead><tr>
                <th style={{ width: 32 }}><Checkbox checked={all} onChange={(v) => setSelected(v ? items.map((r) => r.id) : [])} /></th>
                <th>{__("Nguồn")}</th><th>{__("Đích")}</th><th style={{ width: 70 }}>{__("Mã")}</th>
                <th className="num" style={{ width: 90 }}>{__("Lượt")}</th><th style={{ width: 150 }}>{__("Lần cuối")}</th><th style={{ width: 120 }} />
              </tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} style={{ opacity: r.status === "active" ? 1 : 0.55 }}>
                    <td><Checkbox checked={selected.includes(r.id)} onChange={(v) => setSelected(v ? [...selected, r.id] : selected.filter((x) => x !== r.id))} /></td>
                    <td>
                      {r.sources.map((s, i) => (
                        <div key={i} className="ecx-flex" style={{ gap: 6 }}>
                          <code className="ecx-mono ecx-trunc" style={{ maxWidth: 320 }}>{s.pattern}</code>
                          {s.comparison !== "exact" && <Badge tone="blue">{__(COMPARISONS.find((c) => c.value === s.comparison)?.label ?? s.comparison)}</Badge>}
                        </div>
                      ))}
                      <div className="ecx-flex" style={{ gap: 6, marginTop: 2 }}>
                        {r.isAuto && <Badge>{__("Tự động")}</Badge>}
                        {r.status !== "active" && <Badge tone="yellow">{__("Đang tắt")}</Badge>}
                        {r.notes && <span className="ecx-muted ecx-trunc" style={{ maxWidth: 300 }}>{noteText(r.notes)}</span>}
                      </div>
                    </td>
                    <td>{noTarget(r.type) ? <span className="ecx-muted">—</span> : <code className="ecx-mono ecx-trunc" style={{ maxWidth: 280 }}>{r.target}</code>}</td>
                    <td><Badge tone={r.type >= 400 ? "red" : r.type === 301 ? "green" : "yellow"}>{r.type}</Badge></td>
                    <td className="num">{r.hits.toLocaleString()}</td>
                    <td className="ecx-muted">{r.lastAccessedAt ? new Date(r.lastAccessedAt).toLocaleString() : "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(structuredClone(r))}>{__("Sửa")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(r.id)} aria-label={__("Xoá")}>{Icon.trash(14)}</Button>
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

      {editing && <RedirectModal rule={editing} defaultType={defaultType} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}

      <Modal open={showImport} title={__("Nhập chuyển hướng từ CSV")} onClose={() => setShowImport(false)} width={640}
        footer={<><Button variant="secondary" onClick={() => setShowImport(false)}>{__("Huỷ")}</Button><Button variant="primary" disabled={!csv.trim()} onClick={importCsv}>{__("Nhập")}</Button></>}>
        <p className="ecx-muted" style={{ marginTop: 0 }}>{__("Mỗi dòng: nguồn,đích,mã,kiểu khớp,trạng thái. Chỉ cần hai cột đầu; mã mặc định 301, kiểu khớp mặc định exact.")}</p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); e.target.value = ""; }} />
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>{__("Chọn file CSV")}</Button>
        <Textarea rows={10} className="ecx-mono" style={{ marginTop: 8, width: "100%" }} value={csv} placeholder={"/bai-cu,/bai-moi,301,exact\n/khuyen-mai-2024,,410"} onChange={(e) => setCsv(e.target.value)} />
      </Modal>
    </>
  );
}
