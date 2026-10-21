import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Button, Checkbox, Field, Input, MediaPicker, Select, Spinner, Tabs, Textarea, api, notify, useApi } from "@cms/admin-sdk";
import type { ImageRef, Robots, SeoSettings } from "../../frontend/lib/settings";
import { VARIABLES } from "../../frontend/lib/vars";
import { t } from "./i18n";

export const API = "/plugins/ecomcx-seo";

// ------------------------------------------------------------------ biểu tượng (SVG nhỏ, không phụ thuộc thư viện)
const svg = (d: ReactNode, size = 16) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
export const Icon = {
  check: (s?: number) => svg(<polyline points="20 6 9 17 4 12" />, s),
  warn: (s?: number) => svg(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>, s),
  x: (s?: number) => svg(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, s),
  info: (s?: number) => svg(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>, s),
  plus: (s?: number) => svg(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, s),
  trash: (s?: number) => svg(<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>, s),
  external: (s?: number) => svg(<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>, s),
  desktop: (s?: number) => svg(<><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>, s),
  mobile: (s?: number) => svg(<><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>, s),
  chevron: (s?: number) => svg(<polyline points="6 9 12 15 18 9" />, s),
  star: (s?: number) => svg(<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" />, s),
};

// ------------------------------------------------------------------ điểm SEO

export function ScoreBadge({ score, size = "md" }: { score?: number | null; size?: "sm" | "md" | "lg" }) {
  const cls = score == null ? "none" : score >= 80 ? "good" : score >= 50 ? "ok" : "bad";
  return <span className={`ecx-score ecx-score-${cls} ecx-score-${size}`} title={t("ui.seo_score")}>{score == null ? "–" : score}{size === "lg" && score != null && <small>/100</small>}</span>;
}

export function StatusIcon({ status }: { status: "pass" | "warning" | "fail" | "info" }) {
  return <span className={`ecx-status ecx-status-${status}`}>{status === "pass" ? Icon.check(14) : status === "fail" ? Icon.x(14) : status === "info" ? Icon.info(14) : Icon.warn(14)}</span>;
}

/** Đếm ký tự + thanh độ dài (xanh khi trong khoảng khuyến nghị). */
export function Counter({ value, min, max }: { value: string; min: number; max: number }) {
  const n = value.length;
  const tone = n === 0 ? "none" : n < min ? "ok" : n <= max ? "good" : "bad";
  return (
    <span className="ecx-counter">
      <span className={`ecx-counter-bar ecx-${tone}`} style={{ width: `${Math.min(100, (n / max) * 100)}%` }} />
      <span className="ecx-counter-text">{t("ui.characters", { n, max })}</span>
    </span>
  );
}

/** Ô nhập mẫu có nút chèn biến (%title%, %sep%…). */
export function TemplateInput({ value, onChange, multiline, placeholder }: { value: string; onChange(v: string): void; multiline?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const insert = (name: string) => {
    const el = ref.current;
    const pos = el?.selectionStart ?? value.length;
    const next = value.slice(0, pos) + (pos > 0 && !/\s$/.test(value.slice(0, pos)) ? " " : "") + name + value.slice(el?.selectionEnd ?? pos);
    onChange(next);
    setOpen(false);
  };
  return (
    <div className="ecx-tpl">
      {multiline ? <Textarea ref={ref as any} rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <Input ref={ref as any} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
      <button type="button" className="ecx-tpl-btn" onClick={() => setOpen(!open)} title={t("ui.insert_variable")}>%</button>
      {open && (
        <div className="ecx-tpl-menu" role="listbox">
          {VARIABLES.map((v) => (
            <button key={v.name} type="button" onClick={() => insert(v.name === "%customfield(key)%" ? "%customfield()%" : v.name)}>
              <code>{v.name}</code><span>{t(v.description)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Chọn robots: noindex, nofollow… (null = dùng mặc định). */
export function RobotsField({ value, onChange, allowDefault, defaultLabel }: { value: Robots | null | undefined; onChange(v: Robots | null): void; allowDefault?: boolean; defaultLabel?: string }) {
  const custom = value != null;
  const r = value ?? {};
  const set = (k: keyof Robots, v: boolean) => onChange({ ...r, [k]: v });
  return (
    <div className="ecx-robots">
      {allowDefault && <Checkbox checked={!custom} onChange={(v) => onChange(v ? null : {})} label={defaultLabel ?? t("ui.use_default_settings")} />}
      {(!allowDefault || custom) && (
        <div className="ecx-robots-grid">
          <Checkbox checked={!!r.noindex} onChange={(v) => set("noindex", v)} label={t("ui.no_index_noindex")} description={t("ui.hide_the_page_from_search")} />
          <Checkbox checked={!!r.nofollow} onChange={(v) => set("nofollow", v)} label={t("ui.don_t_follow_links_nofollow")} />
          <Checkbox checked={!!r.noarchive} onChange={(v) => set("noarchive", v)} label={t("ui.don_t_cache_noarchive")} />
          <Checkbox checked={!!r.nosnippet} onChange={(v) => set("nosnippet", v)} label={t("ui.no_snippet_nosnippet")} />
          <Checkbox checked={!!r.noimageindex} onChange={(v) => set("noimageindex", v)} label={t("ui.don_t_index_images_noimageindex")} />
        </div>
      )}
    </div>
  );
}

export function ImageField({ value, onChange }: { value: ImageRef | undefined; onChange(v: ImageRef): void }) {
  return <MediaPicker value={value?.url ? { id: value.id ?? 0, url: value.url } : null} onChange={(m) => onChange(m ? { id: m.id, url: m.url, ...(m as any).width ? { width: (m as any).width, height: (m as any).height } : {} } : null)} />;
}

/** Danh sách chuỗi (mỗi dòng một giá trị). */
export function LinesInput({ value, onChange, placeholder, rows = 4 }: { value: string[] | undefined; onChange(v: string[]): void; placeholder?: string; rows?: number }) {
  const [text, setText] = useState((value ?? []).join("\n"));
  useEffect(() => { setText((value ?? []).join("\n")); }, [JSON.stringify(value ?? [])]);
  return <Textarea rows={rows} value={text} placeholder={placeholder} onChange={(e) => { setText(e.target.value); onChange(e.target.value.split("\n").map((x) => x.trim()).filter(Boolean)); }} />;
}

/** Danh sách số (ID), cách nhau dấu phẩy. */
export function IdsInput({ value, onChange, placeholder }: { value: number[] | undefined; onChange(v: number[]): void; placeholder?: string }) {
  const [text, setText] = useState((value ?? []).join(", "));
  return <Input value={text} placeholder={placeholder} onChange={(e) => { setText(e.target.value); onChange(e.target.value.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0)); }} />;
}

export function Row({ label, help, children }: { label: ReactNode; help?: ReactNode; children: ReactNode }) {
  return <div className="ecx-row"><div className="ecx-row-label"><div>{label}</div>{help && <small>{help}</small>}</div><div className="ecx-row-control">{children}</div></div>;
}

export function Hint({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return <div className={`ecx-hint ecx-hint-${tone}`}>{tone === "warn" ? Icon.warn(15) : Icon.info(15)}<div>{children}</div></div>;
}

// ------------------------------------------------------------------ cài đặt: tải, sửa nháp, lưu

export function useSeoSettings() {
  const { data, loading, reload } = useApi<SeoSettings>(`${API}/settings`);
  const [draft, setDraft] = useState<SeoSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setDraft(structuredClone(data)); }, [data]);
  const dirty = !!data && !!draft && JSON.stringify(data) !== JSON.stringify(draft);
  /** Sửa theo đường dẫn: patch(["general", "separator"], "|"). */
  const patch = (path: Array<string | number>, value: any) => setDraft((d) => {
    if (!d) return d;
    const next: any = structuredClone(d);
    let o = next;
    for (const k of path.slice(0, -1)) { o[k] ??= {}; o = o[k]; }
    o[path[path.length - 1]] = value;
    return next;
  });
  async function save() {
    if (!draft) return;
    setSaving(true);
    try { await api.put(`${API}/settings`, draft); notify.success(t("ui.seo_settings_saved")); reload(); }
    catch (e) { notify.error((e as Error).message); }
    finally { setSaving(false); }
  }
  return { settings: draft, loading: loading && !draft, dirty, saving, patch, save, reset: () => data && setDraft(structuredClone(data)), reload };
}

/** Khung trang cài đặt: thẻ + thanh lưu dính dưới đáy khi có thay đổi. */
export function SettingsShell({ tabs, tab, onTab, dirty, saving, onSave, onReset, children }: {
  tabs: Array<{ value: string; label: string }>; tab: string; onTab(v: string): void; dirty: boolean; saving: boolean; onSave(): void; onReset(): void; children: ReactNode;
}) {
  return (
    <div className="ecx-shell">
      {tabs.length > 1 && <div className="ecx-shell-tabs"><Tabs value={tab} onChange={onTab} items={tabs} /></div>}
      <div className="ecx-shell-body">{children}</div>
      {dirty && (
        <div className="ecx-savebar">
          <span>{t("ui.you_have_unsaved_changes")}</span>
          <Button variant="secondary" onClick={onReset}>{t("ui.discard_changes")}</Button>
          <Button variant="primary" loading={saving} onClick={onSave}>{t("common.save_changes")}</Button>
        </div>
      )}
    </div>
  );
}

export const Loading = () => <div className="ecx-loading"><Spinner /></div>;

/** Danh sách loại nội dung & phân loại của website (từ bootstrap của admin). */
export function useContentTypes() {
  const { data } = useApi<{ postTypes: Array<{ name: string; label: string; public: boolean; source?: string }>; taxonomies: Array<{ name: string; label: string; public: boolean }> }>("/admin/bootstrap");
  return {
    postTypes: (data?.postTypes ?? []).filter((p) => p.public !== false),
    taxonomies: (data?.taxonomies ?? []).filter((item) => item.public !== false),
  };
}

export { Badge, Field, Select };
