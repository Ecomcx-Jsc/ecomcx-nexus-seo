import { useRef, useState } from "react";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea, api, notify, useApi } from "@ecomcx/ecomweb-admin-sdk";
import { API, Icon, Loading } from "../ui";
import { t } from "../i18n";

export interface Source { pattern: string; comparison: string; ignoreCase: boolean }
interface Rule {
  id: number; sources: Source[]; target: string; type: number; status: string; hits: number; isAuto: boolean; notes?: string | null;
  createdAt: string; updatedAt: string; lastAccessedAt?: string | null;
}
interface ListResult { items: Rule[]; total: number; page: number; totalPages: number; counts: Record<string, number> }

export const COMPARISONS = [
  { value: "exact", label: t("redirects.exact_match") }, { value: "contains", label: t("redirects.contains") }, { value: "start", label: t("redirects.starts_with") },
  { value: "end", label: t("redirects.ends_with") }, { value: "regex", label: t("redirects.regular_expression") },
];
export const TYPES = [
  { value: "301", label: t("redirects.301_moved_permanently") }, { value: "302", label: t("redirects.302_found_temporary") }, { value: "307", label: t("redirects.307_temporary_redirect") },
  { value: "410", label: t("redirects.410_gone") }, { value: "451", label: t("redirects.451_unavailable_for_legal_reasons") },
];
const noTarget = (type: number) => type === 410 || type === 451;
/** Ghi chú do hệ thống tạo được dịch; ghi chú người dùng giữ nguyên. */
const noteText = (n: string) => { const m = n.match(/^Tự tạo khi đổi đường dẫn bài #(\d+)$/); return m ? t("redirects.created_automatically_when_post_s", { id: m[1] }) : n; };

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
      notify.success(t("redirects.redirect_saved"));
      onSaved();
    } catch (e) { notify.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open title={draft.id ? t("redirects.edit_redirect") : t("redirects.add_redirect")} onClose={onClose} width={680}
      footer={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" loading={saving} onClick={save}>{t("redirects.save")}</Button></>}>
      <div className="ecx-grid">
        <Field label={t("redirects.source_urls")} help={t("redirects.a_path_on_your_site")}>
          <div className="ecx-grid" style={{ gap: 8 }}>
            {sources.map((s, i) => (
              <div key={i} className="ecx-flex" style={{ flexWrap: "nowrap" }}>
                <Input style={{ flex: 1 }} value={s.pattern} placeholder={s.comparison === "regex" ? "^/tin-tuc/(.*)$" : "/duong-dan-cu"} onChange={(e) => setSource(i, { pattern: e.target.value })} />
                <Select style={{ width: 170 }} value={s.comparison} onChange={(e) => setSource(i, { comparison: e.target.value })} options={COMPARISONS.map((c) => ({ ...c, label: c.label }))} />
                <Button size="sm" variant="ghost" disabled={sources.length === 1} onClick={() => setDraft({ ...draft, sources: sources.filter((_, j) => j !== i) })} aria-label={t("common.delete")}>{Icon.trash(14)}</Button>
              </div>
            ))}
            <div><Button size="sm" variant="secondary" onClick={() => setDraft({ ...draft, sources: [...sources, { pattern: "", comparison: "exact", ignoreCase: true }] })}>{Icon.plus(14)} {t("redirects.add_source")}</Button></div>
          </div>
        </Field>
        <Field label={t("redirects.redirect_type")}>
          <Select value={String(type)} onChange={(e) => setDraft({ ...draft, type: Number(e.target.value) })} options={TYPES.map((item) => ({ ...item, label: item.label }))} />
        </Field>
        {!noTarget(type) && (
          <Field label={t("redirects.target_url")} help={sources.some((s) => s.comparison === "regex") ? t("redirects.use_1_2_to_insert") : t("redirects.a_path_on_your_site_2")}>
            <Input value={draft.target ?? ""} placeholder="/duong-dan-moi" onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
          </Field>
        )}
        <Field label={t("redirects.notes")}><Input value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
        <Checkbox checked={(draft.status ?? "active") === "active"} onChange={(v) => setDraft({ ...draft, status: v ? "active" : "inactive" })} label={t("redirects.active")} />
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
      <Input style={{ width: 280 }} value={path} placeholder={t("redirects.test_a_path_e_g")} onChange={(e) => { setPath(e.target.value); setResult(null); }} onKeyDown={(e) => e.key === "Enter" && run()} />
      <Button variant="secondary" onClick={run}>{t("redirects.test")}</Button>
      {result && (result.matched
        ? <span style={{ color: "var(--app-success)", fontSize: 13 }}>{noTarget(result.type!) ? t("redirects.matches_rule_returns", { id: result.id, type: result.type }) : t("redirects.matches_rule", { id: result.id, type: result.type, target: result.target })}</span>
        : <span className="ecx-muted">{t("redirects.no_rule_matches")}</span>)}
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
    if (action === "delete" && !confirm(t("redirects.delete_selected_redirects", { count: selected.length }))) return;
    try { const r = await api.post<{ affected: number }>(`${API}/redirects/bulk`, { action, ids: selected }); notify.success(t("redirects.updated_rows", { affected: r.affected })); setSelected([]); reload(); }
    catch (e) { notify.error(errorText(e)); }
  }
  async function remove(id: number) {
    if (!confirm(t("redirects.delete_this_redirect"))) return;
    await api.del(`${API}/redirects/${id}`); reload();
  }
  async function exportCsv() {
    const r = await api.get<{ csv: string; count: number }>(`${API}/redirects/export`);
    download(`redirects-${new Date().toISOString().slice(0, 10)}.csv`, r.csv);
  }
  async function importCsv() {
    try {
      const r = await api.post<{ added: number; skipped: number }>(`${API}/redirects/import`, { csv });
      notify.success(t("redirects.imported_redirects_skipped_rows", { added: r.added, skipped: r.skipped }));
      setShowImport(false); setCsv(""); reload();
    } catch (e) { notify.error(errorText(e)); }
  }
  const counts = data?.counts ?? {};
  const total = (counts.active ?? 0) + (counts.inactive ?? 0);

  return (
    <>
      <PageHeader title={t("common.redirects")} description={t("redirects.send_visitors_and_search_engines")}
        actions={<>
          <Button variant="secondary" onClick={() => setShowImport(true)}>{t("redirects.import_csv")}</Button>
          <Button variant="secondary" onClick={exportCsv}>{t("redirects.export_csv")}</Button>
          <Button variant="primary" onClick={() => setEditing({})}>{Icon.plus(14)} {t("redirects.add_redirect")}</Button>
        </>} />
      <Card>
        <div className="ecx-flex" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); setSelected([]); }}
            items={[{ value: "", label: t("redirects.all"), count: total }, { value: "active", label: t("redirects.active"), count: counts.active ?? 0 }, { value: "inactive", label: t("redirects.inactive"), count: counts.inactive ?? 0 }]} />
          <span className="ecx-spacer" />
          <Input style={{ width: 240 }} value={search} placeholder={t("redirects.search_source_target_notes")} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setQ(search); setPage(1); } }} />
        </div>
        <div style={{ marginBottom: 12 }}><TestBox /></div>
        {selected.length > 0 && (
          <div className="ecx-flex" style={{ marginBottom: 10 }}>
            <span className="ecx-muted">{t("redirects.selected", { count: selected.length })}</span>
            <Button size="sm" variant="secondary" onClick={() => bulk("activate")}>{t("redirects.activate")}</Button>
            <Button size="sm" variant="secondary" onClick={() => bulk("deactivate")}>{t("redirects.deactivate")}</Button>
            <Button size="sm" variant="secondary" onClick={() => bulk("reset")}>{t("redirects.reset_hits")}</Button>
            <Button size="sm" variant="danger" onClick={() => bulk("delete")}>{t("common.delete")}</Button>
          </div>
        )}
        {!data ? <Loading /> : items.length === 0 ? (
          <EmptyState title={q ? t("redirects.no_redirects_found") : t("redirects.no_redirects_yet")} description={t("redirects.redirects_are_created_automatically_when")} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ecx-table">
              <thead><tr>
                <th style={{ width: 32 }}><Checkbox checked={all} onChange={(v) => setSelected(v ? items.map((r) => r.id) : [])} /></th>
                <th>{t("redirects.source")}</th><th>{t("redirects.target")}</th><th style={{ width: 70 }}>{t("redirects.type")}</th>
                <th className="num" style={{ width: 90 }}>{t("redirects.hits")}</th><th style={{ width: 150 }}>{t("redirects.last_hit")}</th><th style={{ width: 120 }} />
              </tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} style={{ opacity: r.status === "active" ? 1 : 0.55 }}>
                    <td><Checkbox checked={selected.includes(r.id)} onChange={(v) => setSelected(v ? [...selected, r.id] : selected.filter((x) => x !== r.id))} /></td>
                    <td>
                      {r.sources.map((s, i) => (
                        <div key={i} className="ecx-flex" style={{ gap: 6 }}>
                          <code className="ecx-mono ecx-trunc" style={{ maxWidth: 320 }}>{s.pattern}</code>
                          {s.comparison !== "exact" && <Badge tone="blue">{COMPARISONS.find((c) => c.value === s.comparison)?.label ?? s.comparison}</Badge>}
                        </div>
                      ))}
                      <div className="ecx-flex" style={{ gap: 6, marginTop: 2 }}>
                        {r.isAuto && <Badge>{t("redirects.automatic")}</Badge>}
                        {r.status !== "active" && <Badge tone="yellow">{t("redirects.inactive")}</Badge>}
                        {r.notes && <span className="ecx-muted ecx-trunc" style={{ maxWidth: 300 }}>{noteText(r.notes)}</span>}
                      </div>
                    </td>
                    <td>{noTarget(r.type) ? <span className="ecx-muted">—</span> : <code className="ecx-mono ecx-trunc" style={{ maxWidth: 280 }}>{r.target}</code>}</td>
                    <td><Badge tone={r.type >= 400 ? "red" : r.type === 301 ? "green" : "yellow"}>{r.type}</Badge></td>
                    <td className="num">{r.hits.toLocaleString()}</td>
                    <td className="ecx-muted">{r.lastAccessedAt ? new Date(r.lastAccessedAt).toLocaleString() : "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(structuredClone(r))}>{t("common.edit")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(r.id)} aria-label={t("common.delete")}>{Icon.trash(14)}</Button>
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
            <span className="ecx-muted">{t("common.page", { page, totalPages: data.totalPages })}</span>
            <Button size="sm" variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>›</Button>
          </div>
        )}
      </Card>

      {editing && <RedirectModal rule={editing} defaultType={defaultType} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}

      <Modal open={showImport} title={t("redirects.import_redirects_from_csv")} onClose={() => setShowImport(false)} width={640}
        footer={<><Button variant="secondary" onClick={() => setShowImport(false)}>{t("common.cancel")}</Button><Button variant="primary" disabled={!csv.trim()} onClick={importCsv}>{t("redirects.import")}</Button></>}>
        <p className="ecx-muted" style={{ marginTop: 0 }}>{t("redirects.each_line_source_target_type")}</p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); e.target.value = ""; }} />
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>{t("redirects.choose_csv_file")}</Button>
        <Textarea rows={10} className="ecx-mono" style={{ marginTop: 8, width: "100%" }} value={csv} placeholder={"/bai-cu,/bai-moi,301,exact\n/khuyen-mai-2024,,410"} onChange={(e) => setCsv(e.target.value)} />
      </Modal>
    </>
  );
}
