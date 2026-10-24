import { useState } from "react";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, api, can, notify, useApi } from "@ecomcx/nexus-admin-sdk";
import { API, Hint, Icon, Loading } from "../ui";
import { TYPES, errorText } from "./redirects";
import { t } from "../i18n";

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
    if (!confirm(t("notfound.delete_selected_rows", { count: ids.length }))) return;
    await api.post(`${API}/404/delete`, { action: "delete", ids });
    setSelected([]); reload();
  }
  async function clear() {
    if (!confirm(t("notfound.clear_the_entire_404_log"))) return;
    await api.post(`${API}/404/clear`); setSelected([]); reload();
  }
  async function createRedirect() {
    if (!redirectFor) return;
    setBusy(true);
    try {
      const r = await api.post<{ id: number; sources: number }>(`${API}/404/redirect`, { ids: redirectFor, target: target.trim(), type: Number(type) });
      notify.success(t("notfound.created_a_redirect_for_urls", { sources: r.sources }));
      setRedirectFor(null); setTarget(""); setSelected([]); reload();
    } catch (e) { notify.error(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title={t("notfound.404_monitor")} description={t("notfound.paths_that_visitors_or_search")}
        actions={items.length > 0 ? <Button variant="danger" onClick={clear}>{t("notfound.clear_all")}</Button> : undefined} />
      {settings && settings.modules?.monitor404 === false && <Hint tone="warn">{t("notfound.the_404_monitor_module_is")}</Hint>}
      {data && (
        <div className="ecx-grid-3" style={{ marginBottom: 16 }}>
          <div className="ecx-stat"><div className="ecx-stat-label">{t("notfound.broken_urls")}</div><div className="ecx-stat-value">{data.total.toLocaleString()}</div></div>
          <div className="ecx-stat"><div className="ecx-stat-label">{t("notfound.total_hits")}</div><div className="ecx-stat-value">{data.hits.toLocaleString()}</div></div>
          <div className="ecx-stat"><div className="ecx-stat-label">{t("notfound.hit_in_the_last_24")}</div><div className="ecx-stat-value">{data.today.toLocaleString()}</div></div>
        </div>
      )}
      <Card>
        <div className="ecx-flex" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <Select style={{ width: 200 }} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}
            options={[{ value: "recent", label: t("notfound.most_recent") }, { value: "hits", label: t("notfound.most_hits") }]} />
          <span className="ecx-spacer" />
          <Input style={{ width: 240 }} value={search} placeholder={t("notfound.search_url_or_referrer")} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setQ(search); setPage(1); } }} />
        </div>
        {selected.length > 0 && (
          <div className="ecx-flex" style={{ marginBottom: 10 }}>
            <span className="ecx-muted">{t("notfound.selected", { count: selected.length })}</span>
            {canRedirect && <Button size="sm" variant="secondary" onClick={() => setRedirectFor(selected)}>{t("common.redirects")}</Button>}
            <Button size="sm" variant="danger" onClick={() => remove(selected)}>{t("common.delete")}</Button>
          </div>
        )}
        {!data ? <Loading /> : items.length === 0 ? (
          <EmptyState title={q ? t("notfound.nothing_found") : t("notfound.no_404_errors_logged_yet")} description={t("notfound.the_website_reports_every_visit")} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ecx-table">
              <thead><tr>
                <th style={{ width: 32 }}><Checkbox checked={all} onChange={(v) => setSelected(v ? items.map((r) => r.id) : [])} /></th>
                <th>URL</th><th>{t("notfound.referrer")}</th>
                {advanced && <th>{t("notfound.browser_ip")}</th>}
                <th className="num" style={{ width: 80 }}>{t("notfound.hits")}</th><th style={{ width: 160 }}>{t("notfound.last_hit")}</th><th style={{ width: 120 }} />
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
                      {canRedirect && <Button size="sm" variant="ghost" onClick={() => setRedirectFor([r.id])}>{t("common.redirects")}</Button>}
                      <Button size="sm" variant="ghost" onClick={() => remove([r.id])} aria-label={t("common.delete")}>{Icon.trash(14)}</Button>
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

      <Modal open={!!redirectFor} title={t("notfound.redirect_urls", { value: redirectFor?.length ?? 0 })} onClose={() => setRedirectFor(null)} width={560}
        footer={<><Button variant="secondary" onClick={() => setRedirectFor(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={createRedirect}>{t("notfound.create_redirect")}</Button></>}>
        <div className="ecx-grid">
          <Field label={t("notfound.redirect_type")}><Select value={type} onChange={(e) => setType(e.target.value)} options={TYPES.map((item) => ({ ...item, label: item.label }))} /></Field>
          {type !== "410" && type !== "451" && (
            <Field label={t("notfound.target_url")} help={t("notfound.a_path_on_your_site")}><Input value={target} placeholder="/" onChange={(e) => setTarget(e.target.value)} /></Field>
          )}
          <p className="ecx-muted" style={{ margin: 0 }}>{t("notfound.the_selected_urls_are_removed")}</p>
        </div>
      </Modal>
    </>
  );
}
