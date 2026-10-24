import { Field, Input, registerDashboardWidget, registerEditorSidebar, registerMetaBox, registerPage, registerPostListColumn, registerTermMetaBox, useApi, type MetaBoxProps, type TermMetaBoxProps } from "@ecomcx/ecomweb-admin-sdk";
import { META_KEY, type PostSeo } from "../../frontend/lib/settings";
import { AnalysisPage } from "./pages/analysis";
import { BulkPage } from "./pages/bulk";
import { DashboardPage } from "./pages/dashboard";
import { NotFoundPage } from "./pages/notfound";
import { RedirectsPage } from "./pages/redirects";
import { SchemaPage } from "./pages/schema";
import { SettingsPage } from "./pages/settings";
import { SitemapPage } from "./pages/sitemap";
import { TitlesPage } from "./pages/titles";
import { ToolsPage } from "./pages/tools";
import { SeoBox } from "./seo-box";
import { API, Counter, ImageField, RobotsField, ScoreBadge, TemplateInput } from "./ui";
import "./seo.css";
import { t } from "./i18n";

// ------------------------------------------------------------------ trang quản trị (khớp menu khai báo ở backend)
registerPage({ path: "/ecx-seo", title: "SEO", component: DashboardPage });
registerPage({ path: "/ecx-seo/titles", title: t("app.titles_meta"), component: TitlesPage });
registerPage({ path: "/ecx-seo/settings", title: t("app.general_settings"), component: SettingsPage });
registerPage({ path: "/ecx-seo/sitemap", title: "Sitemap", component: SitemapPage });
registerPage({ path: "/ecx-seo/schema", title: "Schema", component: SchemaPage });
registerPage({ path: "/ecx-seo/redirects", title: t("app.redirects"), component: RedirectsPage });
registerPage({ path: "/ecx-seo/404", title: t("app.404_monitor"), component: NotFoundPage });
registerPage({ path: "/ecx-seo/analysis", title: t("app.analysis"), component: AnalysisPage });
registerPage({ path: "/ecx-seo/bulk", title: t("app.bulk_edit"), component: BulkPage });
registerPage({ path: "/ecx-seo/tools", title: t("app.tools"), component: ToolsPage });

// ------------------------------------------------------------------ trình soạn bài
// Sidebar riêng + nút điểm trên thanh hành động (như Rank Math); CMS cũ chưa có sidebar plugin thì dùng hộp meta dưới nội dung.
// Điểm hiện trên nút đọc từ meta — SeoBox luôn được giữ mount nên vẫn chấm và lưu điểm khi sidebar đang đóng.
function SeoHeaderItem({ meta, active, toggle }: MetaBoxProps & { active: boolean; toggle(): void }) {
  const seo: PostSeo = meta[META_KEY] ?? {};
  return (
    <button type="button" className={`ecx-header-item${active ? " active" : ""}`} aria-pressed={active} onClick={toggle}>
      <ScoreBadge score={seo.focusKeywords?.[0] ? seo.score : null} size="sm" />SEO
    </button>
  );
}
if ((globalThis as any).__CMS_ADMIN__?.registerEditorSidebar)
  registerEditorSidebar({ id: "ecx-seo", title: "SEO", priority: 20, headerItem: SeoHeaderItem, component: SeoBox });
else registerMetaBox({ id: "ecx-seo", title: "SEO", context: "main", priority: 20, component: SeoBox });

// ------------------------------------------------------------------ danh sách bài: điểm + từ khoá
registerPostListColumn({
  id: "ecx-seo", title: "SEO", metaKeys: [META_KEY], width: 150,
  component: ({ row }) => {
    const seo = (row.meta?.[META_KEY] ?? {}) as PostSeo;
    const kw = seo.focusKeywords?.[0];
    return (
      <div className="ecx-col">
        <ScoreBadge score={kw ? seo.score : null} size="sm" />
        <span className="ecx-muted ecx-trunc" style={{ maxWidth: 110 }} title={kw ?? ""}>{kw ?? t("app.no_keyword_yet")}</span>
        {seo.robots?.noindex && <span className="ecx-pill fail">noindex</span>}
      </div>
    );
  },
});

// ------------------------------------------------------------------ chuyên mục / thẻ
function TermSeoBox({ meta, setMeta, term }: TermMetaBoxProps) {
  const seo: PostSeo = meta[META_KEY] ?? {};
  const update = (patch: Partial<PostSeo>) => setMeta(META_KEY, { ...seo, ...patch });
  return (
    <div className="ecx-grid">
      <Field label={t("common.seo_title")} help={<Counter value={seo.title ?? ""} min={30} max={60} />}>
        <TemplateInput value={seo.title ?? ""} placeholder={`${term.name || t("app.category_name")} …`} onChange={(v) => update({ title: v || undefined })} />
      </Field>
      <Field label={t("common.seo_description")} help={<Counter value={seo.description ?? ""} min={120} max={160} />}>
        <TemplateInput multiline value={seo.description ?? ""} placeholder={term.description} onChange={(v) => update({ description: v || undefined })} />
      </Field>
      <Field label={t("app.breadcrumb_title")}><Input value={seo.breadcrumbTitle ?? ""} placeholder={term.name} onChange={(e) => update({ breadcrumbTitle: e.target.value || undefined })} /></Field>
      <Field label={t("app.canonical_url")}><Input value={seo.canonical ?? ""} placeholder="https://" onChange={(e) => update({ canonical: e.target.value || undefined })} /></Field>
      <Field label={t("app.share_image")}><ImageField value={seo.og?.image} onChange={(v) => update({ og: { ...seo.og, image: v } })} /></Field>
      <Field label={t("common.robots")}><RobotsField allowDefault value={seo.robots} onChange={(v) => update({ robots: v })} /></Field>
    </div>
  );
}
registerTermMetaBox({ id: "ecx-seo", title: "SEO", component: TermSeoBox });

// ------------------------------------------------------------------ widget bảng tin
function SeoWidget() {
  const { data } = useApi<{ posts: { total: number; good: number; ok: number; bad: number; unscored: number }; notFound: { lastWeek: number }; audit: { score: number } | null }>(`${API}/dashboard`);
  if (!data) return null;
  const p = data.posts;
  return (
    <div className="ecx-grid" style={{ gap: 8 }}>
      <div className="ecx-flex"><span className="ecx-muted" style={{ flex: 1 }}>{t("app.site_audit_score")}</span><ScoreBadge score={data.audit?.score ?? null} size="sm" /></div>
      <div className="ecx-flex"><span className="ecx-muted" style={{ flex: 1 }}>{t("app.good_poor_posts")}</span><strong>{p.good} / {p.bad}</strong></div>
      <div className="ecx-flex"><span className="ecx-muted" style={{ flex: 1 }}>{t("app.404_errors_7_days")}</span><strong>{data.notFound.lastWeek}</strong></div>
      <a className="ecx-link" href="#/ecx-seo">{t("app.open_seo")} →</a>
    </div>
  );
}
registerDashboardWidget({ id: "ecx-seo", title: "SEO", component: SeoWidget });
