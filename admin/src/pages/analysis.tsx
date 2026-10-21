import { useMemo, useState } from "react";
import { Button, Card, EmptyState, Input, PageHeader, Select, Tabs, api, notify, useApi } from "@cms/admin-sdk";
import { API, Hint, Icon, Loading, ScoreBadge, StatusIcon } from "../ui";
import { useHashTab } from "./titles";
import { t } from "../i18n";

type Status = "pass" | "warning" | "fail" | "info";
interface AuditItem { id: string; group: string; title: string; status: Status; message: string; args?: string[] | null; items?: Array<{ postId: number; title: string; type?: string }> | null }
interface Audit { score: number; at: string; items: AuditItem[] }
interface Competitor { url: string; score: number; items: AuditItem[]; timeMs: number; size: number }

const GROUPS: Record<string, string> = { basic: t("analysis.basics"), content: t("analysis.content"), config: t("analysis.seo_configuration"), homepage: t("analysis.home"), page: "Trang" };
const ORDER: Status[] = ["fail", "warning", "pass", "info"];

function Results({ items }: { items: AuditItem[] }) {
  const [filter, setFilter] = useState<"" | Status>("");
  const [open, setOpen] = useState<string | null>(null);
  const counts = { fail: 0, warning: 0, pass: 0, info: 0 } as Record<Status, number>;
  items.forEach((i) => counts[i.status]++);
  const groups = [...new Set(items.map((i) => i.group))];
  const shown = items.filter((i) => !filter || i.status === filter);
  return (
    <>
      <Tabs value={filter} onChange={(v) => setFilter(v as any)} items={[
        { value: "", label: t("analysis.all"), count: items.length }, { value: "fail", label: t("analysis.errors"), count: counts.fail },
        { value: "warning", label: t("analysis.warnings"), count: counts.warning }, { value: "pass", label: t("analysis.passed"), count: counts.pass },
      ]} />
      <div style={{ marginTop: 12 }}>
        {groups.map((g) => {
          const list = shown.filter((i) => i.group === g).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
          if (!list.length) return null;
          return (
            <div key={g} style={{ marginBottom: 14 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 13 }}>{GROUPS[g] ?? g}</h4>
              <div className="ecx-checks">
                {list.map((i) => (
                  <div key={i.id}>
                    <div className="ecx-check">
                      <StatusIcon status={i.status} />
                      <div style={{ flex: 1 }}>
                        <strong>{i.title}</strong> <span className="ecx-muted">— {legacyMessage(i)}</span>
                        {!!i.items?.length && (
                          <button type="button" className="ecx-link" style={{ border: 0, background: "none", padding: 0, marginLeft: 6, cursor: "pointer" }}
                            onClick={() => setOpen(open === i.id ? null : i.id)}>{open === i.id ? t("analysis.hide") : t("analysis.show_posts", { count: i.items.length })}</button>
                        )}
                      </div>
                    </div>
                    {open === i.id && (
                      <ul style={{ margin: "0 0 6px 30px", padding: 0, listStyle: "none", fontSize: 13 }}>
                        {i.items!.map((p) => <li key={p.postId}><a className="ecx-link" href={`#/content/${p.type ?? "post"}/${p.postId}`}>{p.title || `#${p.postId}`}</a></li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SiteAudit() {
  const { data, reload } = useApi<Audit | null>(`${API}/analysis/site`);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try { await api.post(`${API}/analysis/site`); reload(); notify.success(t("analysis.analysis_complete")); }
    catch (e) { notify.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card title={t("analysis.full_site_audit")} actions={<Button variant="primary" loading={busy} onClick={run}>{data ? t("analysis.run_again") : t("analysis.start_audit")}</Button>}>
      {data === undefined ? <Loading /> : !data ? (
        <EmptyState title={t("analysis.not_analyzed_yet")} description={t("analysis.checks_settings_content_homepage_robots")} />
      ) : (
        <>
          <div className="ecx-flex" style={{ marginBottom: 14, gap: 14 }}>
            <ScoreBadge score={data.score} size="lg" />
            <div className="ecx-muted">{t("analysis.last_run", { value: new Date(data.at).toLocaleString() })}</div>
          </div>
          <Results items={data.items} />
        </>
      )}
    </Card>
  );
}

function CompetitorAudit() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Competitor | null>(null);
  async function run() {
    if (!url.trim()) return;
    setBusy(true); setResult(null);
    try { setResult(await api.post<Competitor>(`${API}/analysis/competitor`, { url: /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}` })); }
    catch (e) { notify.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card title={t("analysis.analyze_any_page")}>
      <div className="ecx-flex" style={{ marginBottom: 14 }}>
        <Input style={{ flex: 1, minWidth: 240 }} value={url} placeholder="https://doithu.vn/bai-viet" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <Button variant="primary" loading={busy} onClick={run}>{t("analysis.analysis")}</Button>
      </div>
      {result && (
        <>
          <div className="ecx-flex" style={{ marginBottom: 14, gap: 14 }}>
            <ScoreBadge score={result.score} size="lg" />
            <div>
              <a className="ecx-link" href={result.url} target="_blank" rel="noreferrer">{result.url} {Icon.external(12)}</a>
              <div className="ecx-muted">{t("analysis.loaded_in_ms_kb", { timeMs: result.timeMs, value: Math.round(result.size / 1024) })}</div>
            </div>
          </div>
          <Results items={result.items} />
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Search Console

interface Totals { clicks: number; impressions: number; ctr: number; position: number }
interface Day { date: string; clicks: number; impressions: number; ctr: number; position: number }
interface TopRow { key: string; clicks: number; impressions: number; ctr: number; position: number }

const METRICS = [
  { key: "clicks", label: t("analysis.clicks"), fmt: (n: number) => Math.round(n).toLocaleString() },
  { key: "impressions", label: t("analysis.impressions"), fmt: (n: number) => Math.round(n).toLocaleString() },
  { key: "ctr", label: "CTR", fmt: (n: number) => `${(n * 100).toFixed(1)}%` },
  { key: "position", label: t("analysis.average_position"), fmt: (n: number) => n.toFixed(1) },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

/** Biểu đồ đường một chỉ số, có đường dóng + chú thích khi rê chuột. Vị trí: trục đảo (càng cao càng tốt). */
function LineChart({ days, metric }: { days: Day[]; metric: MetricKey }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 180, P = { l: 40, r: 10, t: 10, b: 22 };
  const m = METRICS.find((x) => x.key === metric)!;
  const values = days.map((d) => Number(d[metric]) || 0);
  const invert = metric === "position";
  const max = Math.max(...values, metric === "ctr" ? 0.01 : 1);
  const min = invert ? Math.max(1, Math.min(...values)) : 0;
  const x = (i: number) => P.l + (days.length <= 1 ? 0 : (i * (W - P.l - P.r)) / (days.length - 1));
  const y = (v: number) => {
    const item = max === min ? 0.5 : (v - min) / (max - min);
    return P.t + (invert ? item : 1 - item) * (H - P.t - P.b);
  };
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = [0, 0.5, 1].map((item) => min + item * (max - min));
  const labelEvery = Math.max(1, Math.ceil(days.length / 6));
  return (
    <div className="ecx-chart-wrap">
      <svg className="ecx-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }} role="img" aria-label={m.label}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(days.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (days.length - 1)))));
        }}>
        {ticks.map((item, i) => (
          <g key={i}><line className="grid" x1={P.l} x2={W - P.r} y1={y(item)} y2={y(item)} /><text x={P.l - 6} y={y(item) + 3} textAnchor="end">{m.fmt(item)}</text></g>
        ))}
        {days.map((d, i) => i % labelEvery === 0 && <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle">{d.date.slice(5)}</text>)}
        <path d={path} fill="none" stroke="var(--app-accent)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover != null && (<>
          <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--app-border-strong)" vectorEffect="non-scaling-stroke" />
          <circle cx={x(hover)} cy={y(values[hover])} r={4} fill="var(--app-accent)" stroke="var(--app-panel)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </>)}
      </svg>
      {hover != null && (
        <div className="ecx-chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <div className="ecx-muted">{new Date(days[hover].date).toLocaleDateString()}</div>
          <strong>{m.fmt(values[hover])}</strong> <span className="ecx-muted">{m.label}</span>
        </div>
      )}
    </div>
  );
}

function TopTable({ rows, dim }: { rows: TopRow[]; dim: "page" | "query" }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ecx-table">
        <thead><tr>
          <th>{dim === "page" ? t("analysis.page") : t("analysis.keyword")}</th>
          {METRICS.map((m) => <th key={m.key} className="num" style={{ width: 110 }}>{m.label}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{dim === "page" ? <a className="ecx-link ecx-trunc" href={r.key} target="_blank" rel="noreferrer">{r.key.replace(/^https?:\/\/[^/]+/, "") || "/"}</a> : <span className="ecx-trunc">{r.key}</span>}</td>
              {METRICS.map((m) => <td key={m.key} className="num">{m.fmt(r[m.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeywordTracker({ days }: { days: number }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ keyword: string; totals: Totals; daily: Day[] } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    try { setResult(await api.get(`${API}/analytics/keyword?q=${encodeURIComponent(q.trim())}&days=${days}`)); }
    catch (e) { notify.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card title={t("analysis.keyword_tracker")}>
      <div className="ecx-flex" style={{ marginBottom: 12 }}>
        <Input style={{ flex: 1, minWidth: 220 }} value={q} placeholder={t("analysis.enter_a_keyword_e_g")} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <Button variant="secondary" loading={busy} onClick={run}>{t("analysis.show_rankings")}</Button>
      </div>
      {result && (result.daily.length === 0 ? <p className="ecx-muted">{t("analysis.no_data_for_this_keyword")}</p> : (<>
        <div className="ecx-kpis">
          <div className="ecx-kpi"><small>{t("analysis.average_position")}</small><strong>{result.totals.position.toFixed(1)}</strong></div>
          <div className="ecx-kpi"><small>{t("analysis.clicks")}</small><strong>{Math.round(result.totals.clicks).toLocaleString()}</strong></div>
          <div className="ecx-kpi"><small>{t("analysis.impressions")}</small><strong>{Math.round(result.totals.impressions).toLocaleString()}</strong></div>
        </div>
        <LineChart days={result.daily} metric="position" />
      </>))}
    </Card>
  );
}

function SearchConsolePanel() {
  const { data: status } = useApi<{ configured: boolean; error?: string; property?: string; clientEmail?: string }>(`${API}/analytics/status`);
  const [days, setDays] = useState(28);
  const [metric, setMetric] = useState<MetricKey>("clicks");
  const [dim, setDim] = useState<"page" | "query">("query");
  const ready = status?.configured;
  const { data: summary, error } = useApi<{ totals: Totals; daily: Day[] }>(ready ? `${API}/analytics/summary?days=${days}` : null);
  const { data: top } = useApi<{ rows: TopRow[] }>(ready ? `${API}/analytics/top?dim=${dim}&days=${days}&limit=50` : null);
  const totals = summary?.totals;
  const daily = useMemo(() => summary?.daily ?? [], [summary]);

  if (!status) return <Loading />;
  if (!ready) return (
    <Card title="Google Search Console">
      <EmptyState title={t("analysis.search_console_is_not_connected")} description={status.error ? status.error : t("analysis.paste_the_service_account_key")}
        action={<Button variant="primary" onClick={() => { location.hash = "#/ecx-seo/settings?tab=analytics"; }}>{t("analysis.open_settings")}</Button>} />
    </Card>
  );
  return (
    <>
      <div className="ecx-flex" style={{ marginBottom: 12 }}>
        <span className="ecx-muted">{status.property}</span>
        <span className="ecx-spacer" />
        <Select style={{ width: 160 }} value={String(days)} onChange={(e) => setDays(Number(e.target.value))}
          options={[7, 28, 90, 180, 365].map((d) => ({ value: String(d), label: t("analysis.last_days", { d }) }))} />
      </div>
      {error && <Hint tone="warn">{error.message}</Hint>}
      <Card title={t("analysis.search_performance")}>
        {!summary ? <Loading /> : (<>
          <div className="ecx-kpis" role="tablist">
            {METRICS.map((m) => (
              <button key={m.key} type="button" role="tab" aria-selected={metric === m.key} className="ecx-kpi" onClick={() => setMetric(m.key)}
                style={{ textAlign: "left", cursor: "pointer", background: "none", color: "var(--app-fg)", borderColor: metric === m.key ? "var(--app-accent)" : undefined, boxShadow: metric === m.key ? "inset 0 -2px 0 var(--app-accent)" : undefined }}>
                <small>{m.label}</small><strong>{totals ? m.fmt(totals[m.key]) : "–"}</strong>
              </button>
            ))}
          </div>
          {daily.length > 1 ? <LineChart days={daily} metric={metric} /> : <p className="ecx-muted">{t("analysis.no_data_for_this_period")}</p>}
        </>)}
      </Card>
      <div style={{ height: 16 }} />
      <Card title={t("analysis.top")} actions={<Tabs value={dim} onChange={(v) => setDim(v as any)} items={[{ value: "query", label: t("analysis.keyword") }, { value: "page", label: t("analysis.page") }]} />}>
        {!top ? <Loading /> : top.rows.length === 0 ? <p className="ecx-muted">{t("analysis.no_data_yet")}</p> : <TopTable rows={top.rows} dim={dim} />}
      </Card>
      <div style={{ height: 16 }} />
      <KeywordTracker days={days} />
    </>
  );
}

/** Kết quả phân tích lưu từ bản trước 1.2.0: thông điệp còn biến {0} + args riêng (bản mới máy chủ đã dịch sẵn). */
const legacyMessage = (i: { message: string; args?: Array<string | number> }) =>
  i.args?.length ? i.message.replace(/\{(\d+)\}/g, (m, n) => String(i.args![Number(n)] ?? m)) : i.message;

export function AnalysisPage() {
  const [tab, setTab] = useHashTab("site");
  return (
    <>
      <PageHeader title={t("analysis.seo_analysis")} />
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} items={[{ value: "site", label: t("analysis.website") }, { value: "competitor", label: t("analysis.any_page") }, { value: "search", label: "Search Console" }]} />
      </div>
      {tab === "site" && <SiteAudit />}
      {tab === "competitor" && <CompetitorAudit />}
      {tab === "search" && <SearchConsolePanel />}
    </>
  );
}
