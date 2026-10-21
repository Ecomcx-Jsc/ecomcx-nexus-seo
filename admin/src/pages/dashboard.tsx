import { Button, Card, PageHeader, Switch, can, useApi } from "@cms/admin-sdk";
import { API, Loading, ScoreBadge, useSeoSettings } from "../ui";
import { t } from "../i18n";

interface Stats {
  posts: { total: number; good: number; ok: number; bad: number; unscored: number; noDescription: number; noKeyword: number };
  redirects: { count: number; hits: number };
  notFound: { count: number; hits: number; lastWeek: number };
  audit: { score: number; at: string } | null;
}

/** Module bật/tắt + trang cài đặt tương ứng. */
export const MODULES: Array<{ key: string; title: string; description: string; link?: string }> = [
  { key: "schema", title: t("dashboard.schema_structured_data"), description: t("dashboard.json_ld_for_your_organization"), link: "/ecx-seo/schema" },
  { key: "sitemap", title: "Sitemap", description: t("dashboard.customize_sitemap_xml_content_types"), link: "/ecx-seo/sitemap" },
  { key: "redirections", title: t("dashboard.redirects"), description: t("dashboard.301_302_307_410_pattern"), link: "/ecx-seo/redirects" },
  { key: "monitor404", title: t("dashboard.404_monitor"), description: t("dashboard.log_broken_links_so_you"), link: "/ecx-seo/404" },
  { key: "breadcrumbs", title: "Breadcrumbs", description: t("dashboard.navigation_trail_ecx_breadcrumbs_breadcrumblist"), link: "/ecx-seo/settings?tab=breadcrumbs" },
  { key: "imageSeo", title: t("dashboard.image_seo"), description: t("dashboard.fill_in_image_alt_text"), link: "/ecx-seo/settings?tab=images" },
  { key: "indexNow", title: t("dashboard.instant_indexing_indexnow"), description: t("dashboard.notify_bing_yandex_as_soon"), link: "/ecx-seo/settings?tab=indexnow" },
  { key: "localSeo", title: "Local SEO", description: t("dashboard.address_opening_hours_and_coordinates"), link: "/ecx-seo/schema" },
  { key: "newsSitemap", title: t("dashboard.news_sitemap"), description: t("dashboard.news_sitemap_xml_for_google"), link: "/ecx-seo/sitemap" },
  { key: "videoSitemap", title: "Sitemap & schema video", description: t("dashboard.detects_videos_in_posts_video"), link: "/ecx-seo/sitemap" },
  { key: "analytics", title: "Google Analytics & Search Console", description: t("dashboard.add_ga4_tag_manager_and"), link: "/ecx-seo/settings?tab=analytics" },
  { key: "linkCounter", title: t("dashboard.link_counter"), description: t("dashboard.count_internal_external_links_of") },
  { key: "llmsTxt", title: "llms.txt", description: t("dashboard.site_summary_for_ai_assistants"), link: "/ecx-seo/settings?tab=llms" },
];

export function DashboardPage() {
  const { data: stats } = useApi<Stats>(`${API}/dashboard`);
  const st = useSeoSettings();
  const admin = can("ecx_seo_settings");
  const go = (path: string) => { location.hash = "#" + path; };
  const p = stats?.posts;
  const pct = (n: number) => (p && p.total ? `${(n / p.total) * 100}%` : "0%");

  async function toggle(key: string, value: boolean) {
    if (!st.settings) return;
    st.patch(["modules", key], value);
  }

  return (
    <>
      <PageHeader title={t("dashboard.seo")} description={t("dashboard.search_optimization_overview_of_your")}
        actions={<Button variant="secondary" onClick={() => go("/ecx-seo/analysis")}>{t("dashboard.site_audit")}</Button>} />
      {!stats ? <Loading /> : (
        <div className="ecx-stats" style={{ marginBottom: 16 }}>
          <div className="ecx-stat">
            <div className="ecx-stat-label">{t("dashboard.seo_score_of_published_posts")}</div>
            <div className="ecx-stat-value">{p!.total}</div>
            <div className="ecx-bars" title={t("dashboard.good_fair_poor_not_scored")}>
              <span style={{ width: pct(p!.good), background: "var(--app-success)" }} />
              <span style={{ width: pct(p!.ok), background: "var(--app-warning)" }} />
              <span style={{ width: pct(p!.bad), background: "var(--app-danger)" }} />
            </div>
            <div className="ecx-muted" style={{ marginTop: 6 }}>{t("dashboard.good_fair_poor_not_scored_2", { good: p!.good, ok: p!.ok, bad: p!.bad, unscored: p!.unscored })}</div>
          </div>
          <div className="ecx-stat">
            <div className="ecx-stat-label">{t("dashboard.missing_description_keyword")}</div>
            <div className="ecx-stat-value">{p!.noDescription} / {p!.noKeyword}</div>
            <button type="button" className="ecx-link" style={{ border: 0, background: "none", padding: 0, marginTop: 6, cursor: "pointer" }} onClick={() => go("/ecx-seo/bulk")}>{t("dashboard.bulk_edit")} →</button>
          </div>
          <div className="ecx-stat">
            <div className="ecx-stat-label">{t("dashboard.404_errors_7_days")}</div>
            <div className="ecx-stat-value">{stats.notFound.lastWeek}</div>
            <div className="ecx-muted" style={{ marginTop: 6 }}>{t("dashboard.urls_hits", { count: stats.notFound.count, hits: stats.notFound.hits })}</div>
          </div>
          <div className="ecx-stat">
            <div className="ecx-stat-label">{t("dashboard.active_redirects")}</div>
            <div className="ecx-stat-value">{stats.redirects.count}</div>
            <div className="ecx-muted" style={{ marginTop: 6 }}>{t("dashboard.redirects_served", { hits: stats.redirects.hits })}</div>
          </div>
          <div className="ecx-stat">
            <div className="ecx-stat-label">{t("dashboard.site_audit_result")}</div>
            <div className="ecx-stat-value">{stats.audit ? <ScoreBadge score={stats.audit.score} size="lg" /> : "–"}</div>
            <div className="ecx-muted" style={{ marginTop: 6 }}>{stats.audit ? t("dashboard.last_run", { value: new Date(stats.audit.at).toLocaleString() }) : t("dashboard.not_analyzed_yet")}</div>
          </div>
        </div>
      )}

      <Card title={t("dashboard.modules")} description={admin ? t("dashboard.turn_on_only_what_your") : t("dashboard.only_administrators_can_turn_modules")}
        actions={st.dirty ? <Button variant="primary" loading={st.saving} onClick={st.save}>{t("common.save_changes")}</Button> : undefined}>
        {!st.settings ? <Loading /> : (
          <div className="ecx-grid-3">
            {MODULES.map((m) => {
              const on = st.settings!.modules?.[m.key] !== false;
              return (
                <div key={m.key} className={`ecx-module${on ? "" : " off"}`}>
                  <h4><span style={{ flex: 1 }}>{m.title}</span><Switch checked={on} disabled={!admin} onChange={(v) => toggle(m.key, v)} label={m.title} /></h4>
                  <p>{m.description}</p>
                  {m.link && on && <button type="button" className="ecx-link" style={{ border: 0, background: "none", padding: 0, cursor: "pointer", alignSelf: "flex-start" }} onClick={() => go(m.link!.split("?")[0] + (m.link!.includes("?") ? "?" + m.link!.split("?")[1] : ""))}>{t("dashboard.settings")} →</button>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
