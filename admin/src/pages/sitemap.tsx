import { Card, Checkbox, Input, PageHeader, useApi } from "@cms/admin-sdk";
import { Hint, Icon, IdsInput, Loading, Row, SettingsShell, useContentTypes, useSeoSettings } from "../ui";
import { useHashTab } from "./titles";
import { t } from "../i18n";

export function SitemapPage() {
  const st = useSeoSettings();
  const { postTypes, taxonomies } = useContentTypes();
  const { data: boot } = useApi<{ site: { url: string } }>("/admin/bootstrap");
  const [tab, setTab] = useHashTab("general");
  const s = st.settings;
  const site = (boot?.site.url ?? "").replace(/\/$/, "");
  const link = (path: string) => <a className="ecx-link" href={`${site}${path}`} target="_blank" rel="noreferrer">{site}{path} {Icon.external(12)}</a>;
  const tabs = [
    { value: "general", label: t("common.general") }, { value: "types", label: t("common.content_types") },
    { value: "news", label: t("sitemap.news") }, { value: "video", label: t("sitemap.video") },
  ];
  const typeList = (list: string[] | undefined, key: string[]) => (
    <div className="ecx-flex">{postTypes.map((p) => (
      <Checkbox key={p.name} checked={(list ?? []).includes(p.name)} label={p.label}
        onChange={(v) => st.patch(key, v ? [...(list ?? []), p.name] : (list ?? []).filter((x) => x !== p.name))} />
    ))}</div>
  );
  return (
    <>
      <PageHeader title={t("sitemap.sitemap")} description={t("sitemap.a_list_of_urls_that")} />
      {!s ? <Loading /> : (
        <SettingsShell tabs={tabs} tab={tab} onTab={setTab} dirty={st.dirty} saving={st.saving} onSave={st.save} onReset={st.reset}>
          {s.modules?.sitemap === false && <Hint tone="warn">{t("sitemap.the_sitemap_module_is_off")}</Hint>}
          <Card>
            {tab === "general" && (<>
              <Row label={t("sitemap.sitemap_address")} help={t("sitemap.submit_this_address_in_google")}>
                <div className="ecx-grid" style={{ gap: 4 }}>{link("/sitemap.xml")}</div>
              </Row>
              <Row label={t("sitemap.image")}><Checkbox checked={s.sitemap.includeImages} onChange={(v) => st.patch(["sitemap", "includeImages"], v)} label={t("sitemap.add_featured_images_and_images")} /></Row>
              <Row label={t("sitemap.exclude_posts")} help={t("sitemap.post_page_ids_comma_separated")}>
                <IdsInput value={s.sitemap.excludePosts} onChange={(v) => st.patch(["sitemap", "excludePosts"], v)} placeholder="12, 45" />
              </Row>
              <Row label={t("sitemap.exclude_categories_tags")} help={t("sitemap.ids_comma_separated")}>
                <IdsInput value={s.sitemap.excludeTerms} onChange={(v) => st.patch(["sitemap", "excludeTerms"], v)} placeholder="3, 8" />
              </Row>
            </>)}

            {tab === "types" && (<>
              <Hint>{t("sitemap.content_types_set_to_noindex")}</Hint>
              {postTypes.map((p) => (
                <Row key={p.name} label={p.label}>
                  <Checkbox checked={s.sitemap.postTypes?.[p.name] !== false} onChange={(v) => st.patch(["sitemap", "postTypes", p.name], v)} label={t("sitemap.included_in_sitemap")} />
                </Row>
              ))}
              {taxonomies.map((item) => (
                <Row key={item.name} label={item.label}>
                  <Checkbox checked={s.sitemap.taxonomies?.[item.name] !== false} onChange={(v) => st.patch(["sitemap", "taxonomies", item.name], v)} label={t("sitemap.included_in_sitemap")} />
                </Row>
              ))}
            </>)}

            {tab === "news" && (<>
              {!s.modules?.newsSitemap && <Hint tone="warn">{t("sitemap.turn_on_the_news_sitemap")}</Hint>}
              <Row label={t("sitemap.address")} help={t("sitemap.only_posts_published_in_the")}>{link("/news-sitemap.xml")}</Row>
              <Row label={t("sitemap.publication_name")} help={t("sitemap.leave_empty_site_title_must")}>
                <Input value={s.sitemap.news.publicationName} onChange={(e) => st.patch(["sitemap", "news", "publicationName"], e.target.value)} />
              </Row>
              <Row label={t("common.content_types")}>{typeList(s.sitemap.news.postTypes, ["sitemap", "news", "postTypes"])}</Row>
              <Row label={t("sitemap.exclude_categories")} help={t("sitemap.ids_of_categories_that_aren")}>
                <IdsInput value={s.sitemap.news.excludeTerms} onChange={(v) => st.patch(["sitemap", "news", "excludeTerms"], v)} />
              </Row>
            </>)}

            {tab === "video" && (<>
              {!s.modules?.videoSitemap && <Hint tone="warn">{t("sitemap.turn_on_the_video_sitemap")}</Hint>}
              <Row label={t("sitemap.address")} help={t("sitemap.detects_uploaded_videos_youtube_and")}>{link("/video-sitemap.xml")}</Row>
              <Row label={t("common.content_types")}>{typeList(s.sitemap.video.postTypes, ["sitemap", "video", "postTypes"])}</Row>
            </>)}
          </Card>
        </SettingsShell>
      )}
    </>
  );
}
