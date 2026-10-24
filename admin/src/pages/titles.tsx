import { useState } from "react";
import { Card, Checkbox, Input, PageHeader, Select, useApi } from "@ecomcx/ecomweb-admin-sdk";
import { postTypeSettings, taxonomySettings, type SeoSettings, type TypeSettings } from "../../../frontend/lib/settings";
import { replaceVars, type VarContext } from "../../../frontend/lib/vars";
import { Hint, ImageField, LinesInput, Loading, RobotsField, Row, SettingsShell, TemplateInput, useContentTypes, useSeoSettings } from "../ui";
import { t } from "../i18n";

export function useHashTab(fallback: string): [string, (item: string) => void] {
  const initial = new URLSearchParams(location.hash.split("?")[1] ?? "").get("tab") ?? fallback;
  const [tab, setTab] = useState(initial);
  return [tab, (item) => { setTab(item); history.replaceState(null, "", `${location.hash.split("?")[0]}?tab=${item}`); }];
}

const SEPARATORS = ["-", "–", "—", "|", "·", "•", "»", "/", "~", ":"];

function Preview({ s, title, description, sample }: { s: SeoSettings; title: string; description?: string; sample: Partial<VarContext> }) {
  const { data: boot } = useApi<{ site: { title: string; tagline: string; url: string } }>("/admin/bootstrap");
  const ctx: VarContext = {
    site: { title: boot?.site.title ?? "", tagline: boot?.site.tagline }, sep: s.general.separator || "-",
    post: { title: t("titles.sample_post_title"), excerpt: t("titles.a_sample_post_excerpt_to"), publishedAt: new Date().toISOString(), categories: [t("titles.category")], author: { name: t("titles.author") } },
    term: { name: t("titles.category_name"), description: t("titles.sample_category_description") }, author: { name: t("titles.author"), bio: t("titles.author_bio") },
    search: t("titles.keyword"), page: 2, totalPages: 5, dateLabel: t("titles.october_2026"), pageWord: t("titles.page"), ...sample,
  };
  return (
    <div className="ecx-muted" style={{ marginTop: 6 }}>
      {t("titles.preview")} <strong style={{ color: "var(--app-fg)" }}>{replaceVars(title, ctx)}</strong>
      {description != null && description !== "" && <div>{replaceVars(description, ctx)}</div>}
    </div>
  );
}

function TypeEditor({ s, value, onChange, defaults, isPostType, sample }: {
  s: SeoSettings; value: TypeSettings; onChange(v: TypeSettings): void; defaults: TypeSettings; isPostType?: boolean; sample: Partial<VarContext>;
}) {
  const v = { ...defaults, ...value };
  return (
    <>
      <Row label={t("titles.title_template")} help={t("titles.press_to_insert_a_variable")}>
        <TemplateInput value={value.title ?? ""} placeholder={defaults.title} onChange={(item) => onChange({ ...value, title: item || undefined })} />
        <Preview s={s} title={v.title ?? ""} sample={sample} />
      </Row>
      <Row label={t("titles.description_template")} help={t("titles.used_when_a_post_page")}>
        <TemplateInput multiline value={value.description ?? ""} placeholder={defaults.description} onChange={(item) => onChange({ ...value, description: item || undefined })} />
      </Row>
      <Row label={t("common.robots")} help={t("titles.applies_to_every_page_of")}>
        <Checkbox checked={!!value.noindex} onChange={(x) => onChange({ ...value, noindex: x || undefined })} label={t("titles.don_t_index_this_type")} />
        <div style={{ marginTop: 8 }}><RobotsField value={value.robots ?? null} onChange={(r) => onChange({ ...value, robots: r })} allowDefault defaultLabel={t("titles.other_robots_follow_the_general")} /></div>
      </Row>
      {isPostType && (
        <Row label={t("titles.default_schema")} help={t("titles.structured_data_type_added_to")}>
          <Select value={v.schemaType ?? "none"} onChange={(e) => onChange({ ...value, schemaType: e.target.value })}
            options={[{ value: "Article", label: "Article" }, { value: "BlogPosting", label: t("titles.blogposting_blog_post") }, { value: "NewsArticle", label: t("titles.newsarticle_news") }, { value: "WebPage", label: t("titles.webpage_regular_page") }, { value: "none", label: t("titles.none") }]} />
        </Row>
      )}
      {isPostType && (
        <Row label={t("titles.seo_box_in_the_editor")}>
          <Checkbox checked={!value.hideMetaBox} onChange={(x) => onChange({ ...value, hideMetaBox: !x || undefined })} label={t("titles.show_the_seo_box_when")} />
        </Row>
      )}
    </>
  );
}

export function TitlesPage() {
  const st = useSeoSettings();
  const { postTypes, taxonomies } = useContentTypes();
  const [tab, setTab] = useHashTab("global");
  const s = st.settings;
  const tabs = [
    { value: "global", label: t("common.general") }, { value: "home", label: t("titles.home") },
    ...postTypes.map((p) => ({ value: `pt:${p.name}`, label: p.label })),
    ...taxonomies.map((item) => ({ value: `tax:${item.name}`, label: item.label })),
    { value: "author", label: t("titles.author") }, { value: "misc", label: t("titles.archives_more") }, { value: "social", label: t("titles.social") },
  ];
  return (
    <>
      <PageHeader title={t("titles.titles_meta")} description={t("titles.title_description_and_robots_templates")} />
      {!s ? <Loading /> : (
        <SettingsShell tabs={tabs} tab={tab} onTab={setTab} dirty={st.dirty} saving={st.saving} onSave={st.save} onReset={st.reset}>
          <Card>
            {tab === "global" && (<>
              <Row label={t("titles.separator")} help={t("titles.the_sep_variable_in_title")}>
                <div className="ecx-flex">{SEPARATORS.map((x) => (
                  <button key={x} type="button" onClick={() => st.patch(["general", "separator"], x)} className="ecx-chip" style={{ cursor: "pointer", padding: "4px 12px", fontSize: 15, ...(s.general.separator === x ? { borderColor: "var(--app-accent)", color: "var(--app-accent)" } : {}) }}>{x}</button>
                ))}<Input style={{ width: 70 }} value={s.general.separator} onChange={(e) => st.patch(["general", "separator"], e.target.value)} /></div>
              </Row>
              <Row label={t("titles.capitalize_titles")}><Checkbox checked={s.general.capitalizeTitles} onChange={(v) => st.patch(["general", "capitalizeTitles"], v)} label={t("titles.capitalize_the_first_letter_of")} /></Row>
              <Row label={t("titles.default_robots")} help={t("titles.applies_site_wide_when_a")}><RobotsField value={s.general.robots} onChange={(v) => st.patch(["general", "robots"], v ?? {})} /></Row>
              <Row label={t("titles.advanced_snippet")} help={t("titles.max_snippet_max_image_preview")}>
                <div className="ecx-flex">
                  <span className="ecx-muted">{t("titles.snippet_length")}</span><Input type="number" style={{ width: 90 }} value={s.general.advancedRobots.maxSnippet ?? -1} onChange={(e) => st.patch(["general", "advancedRobots", "maxSnippet"], Number(e.target.value))} />
                  <span className="ecx-muted">{t("titles.image_preview")}</span>
                  <Select value={s.general.advancedRobots.maxImagePreview ?? "large"} onChange={(e) => st.patch(["general", "advancedRobots", "maxImagePreview"], e.target.value)} options={[{ value: "large", label: t("titles.large") }, { value: "standard", label: t("titles.standard") }, { value: "none", label: t("titles.none") }]} />
                  <span className="ecx-muted">{t("titles.video_seconds")}</span><Input type="number" style={{ width: 90 }} value={s.general.advancedRobots.maxVideoPreview ?? -1} onChange={(e) => st.patch(["general", "advancedRobots", "maxVideoPreview"], Number(e.target.value))} />
                </div>
              </Row>
              <Row label={t("titles.automatic_noindex")}>
                <div className="ecx-grid" style={{ gap: 8 }}>
                  <Checkbox checked={s.general.noindexEmptyTerms} onChange={(v) => st.patch(["general", "noindexEmptyTerms"], v)} label={t("titles.categories_tags_without_posts")} />
                  <Checkbox checked={s.general.noindexPaginated} onChange={(v) => st.patch(["general", "noindexPaginated"], v)} label={t("titles.paginated_pages_page_2_3")} />
                  <Checkbox checked={s.general.noindexArchiveSubpages} onChange={(v) => st.patch(["general", "noindexArchiveSubpages"], v)} label={t("titles.archive_subpages_category_author_page")} />
                  <Checkbox checked={s.general.noindexSearch} onChange={(v) => st.patch(["general", "noindexSearch"], v)} label={t("titles.search_result_pages")} />
                  <Checkbox checked={s.general.noindexPasswordProtected} onChange={(v) => st.patch(["general", "noindexPasswordProtected"], v)} label={t("titles.password_protected_posts")} />
                </div>
              </Row>
            </>)}

            {tab === "home" && (<>
              <Hint>{t("titles.applies_when_the_homepage_shows")}</Hint>
              <Row label={t("titles.title_template")}><TemplateInput value={s.titles.home.title} onChange={(v) => st.patch(["titles", "home", "title"], v)} /><Preview s={s} title={s.titles.home.title} sample={{}} /></Row>
              <Row label={t("common.description")}><TemplateInput multiline value={s.titles.home.description} onChange={(v) => st.patch(["titles", "home", "description"], v)} /></Row>
              <Row label={t("common.robots")}><RobotsField value={s.titles.home.robots} onChange={(v) => st.patch(["titles", "home", "robots"], v)} allowDefault /></Row>
              <Row label={t("titles.share_title")}><Input value={s.titles.home.ogTitle} onChange={(e) => st.patch(["titles", "home", "ogTitle"], e.target.value)} /></Row>
              <Row label={t("titles.share_description")}><Input value={s.titles.home.ogDescription} onChange={(e) => st.patch(["titles", "home", "ogDescription"], e.target.value)} /></Row>
              <Row label={t("titles.share_image")} help={t("titles.1200_630")}><ImageField value={s.titles.home.ogImage} onChange={(v) => st.patch(["titles", "home", "ogImage"], v)} /></Row>
            </>)}

            {tab.startsWith("pt:") && (() => {
              const type = tab.slice(3);
              return <TypeEditor key={tab} s={s} isPostType value={s.titles.postTypes[type] ?? {}} defaults={postTypeSettings(undefined, type)} sample={{}}
                onChange={(v) => st.patch(["titles", "postTypes", type], v)} />;
            })()}

            {tab.startsWith("tax:") && (() => {
              const tax = tab.slice(4);
              return <TypeEditor key={tab} s={s} value={s.titles.taxonomies[tax] ?? {}} defaults={taxonomySettings(undefined, tax)} sample={{ post: null }}
                onChange={(v) => st.patch(["titles", "taxonomies", tax], v)} />;
            })()}

            {tab === "author" && (<>
              <Row label={t("titles.author_pages")}><Checkbox checked={!s.titles.author.disabled} onChange={(v) => st.patch(["titles", "author", "disabled"], !v)} label={t("titles.let_search_engines_index_author")} /></Row>
              <TypeEditor s={s} value={s.titles.author} defaults={{ title: "%name% %sep% %sitename%", description: "%user_description%" }} sample={{ post: null }}
                onChange={(v) => st.patch(["titles", "author"], { ...s.titles.author, ...v })} />
            </>)}

            {tab === "misc" && (<>
              <Row label={t("titles.date_archives")}><Checkbox checked={!s.titles.date.disabled} onChange={(v) => st.patch(["titles", "date", "disabled"], !v)} label={t("titles.allow_indexing_of_date_archives")} /></Row>
              <TypeEditor s={s} value={s.titles.date} defaults={{ title: "%date% %sep% %sitename%" }} sample={{ post: null }} onChange={(v) => st.patch(["titles", "date"], { ...s.titles.date, ...v })} />
              <Row label={t("titles.search_page_title")}><TemplateInput value={s.titles.search.title} onChange={(v) => st.patch(["titles", "search", "title"], v)} /><Preview s={s} title={s.titles.search.title} sample={{ post: null }} /></Row>
              <Row label={t("titles.404_page_title")}><TemplateInput value={s.titles.notFound.title} onChange={(v) => st.patch(["titles", "notFound", "title"], v)} /><Preview s={s} title={s.titles.notFound.title} sample={{ post: null }} /></Row>
            </>)}

            {tab === "social" && (<>
              <Row label={t("titles.default_share_image")} help={t("titles.used_when_a_post_has")}><ImageField value={s.social.ogImage} onChange={(v) => st.patch(["social", "ogImage"], v)} /></Row>
              <Row label={t("titles.facebook_page")}><Input value={s.social.facebookUrl} placeholder="https://facebook.com/…" onChange={(e) => st.patch(["social", "facebookUrl"], e.target.value)} /></Row>
              <Row label={t("titles.x_twitter_account")}><Input value={s.social.twitterUsername} placeholder="@tencongty" onChange={(e) => st.patch(["social", "twitterUsername"], e.target.value)} /></Row>
              <Row label={t("titles.other_social_profiles")} help={t("titles.one_url_per_line_youtube")}><LinesInput value={s.social.profiles} onChange={(v) => st.patch(["social", "profiles"], v)} placeholder="https://youtube.com/@…" /></Row>
              <Row label={t("titles.x_twitter_card_type")}><Select value={s.social.twitterCard} onChange={(e) => st.patch(["social", "twitterCard"], e.target.value)} options={[{ value: "summary_large_image", label: t("titles.large_image") }, { value: "summary", label: t("titles.summary_small_image") }]} /></Row>
              <Row label="Facebook App ID"><Input value={s.social.facebookAppId} onChange={(e) => st.patch(["social", "facebookAppId"], e.target.value)} /></Row>
              <Row label="Facebook Admin ID"><Input value={s.social.facebookAdminId} onChange={(e) => st.patch(["social", "facebookAdminId"], e.target.value)} /></Row>
              <Row label={t("titles.enhanced_sharing")}><Checkbox checked={s.social.slackEnhanced} onChange={(v) => st.patch(["social", "slackEnhanced"], v)} label={t("titles.show_the_author_and_reading")} /></Row>
            </>)}
          </Card>
        </SettingsShell>
      )}
    </>
  );
}
