import { useState } from "react";
import { Badge, Button, Card, Checkbox, Input, PageHeader, Select, Table, Textarea, api, notify, useApi } from "@ecomcx/ecomweb-admin-sdk";
import { Hint, Icon, LinesInput, Loading, Row, SettingsShell, API, useContentTypes, useSeoSettings } from "../ui";
import { useHashTab } from "./titles";
import { t } from "../i18n";

const DEFAULT_ROBOTS = "User-agent: *\nAllow: /\nDisallow: /api/\n";

function IndexNowPanel() {
  const { data, reload } = useApi<{ key: string; keyLocation: string; siteUrl: string; history: Array<{ id: number; urls: string[]; status: number; message: string; source: string; createdAt: string }> }>(`${API}/indexnow`);
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const r = await api.post<{ status: number; message: string }>(`${API}/indexnow/submit`, { urls: urls.split("\n").map((x) => x.trim()).filter(Boolean) });
      (r.status === 200 || r.status === 202 ? notify.success : notify.info)(r.message);
      setUrls(""); reload();
    } catch (e) { notify.error((e as Error).message); } finally { setBusy(false); }
  }
  async function regenerate() {
    if (!confirm(t("settings.generate_a_new_key_the"))) return;
    await api.post(`${API}/indexnow/regenerate`); reload();
  }
  if (!data) return <Loading />;
  return (<>
    <Row label={t("settings.api_key")} help={t("settings.search_engines_read_the_key")}>
      <div className="ecx-flex"><code className="ecx-mono">{data.key}</code><Button size="sm" variant="ghost" onClick={regenerate}>{t("settings.generate_new_key")}</Button></div>
      <a className="ecx-link ecx-muted" href={data.keyLocation} target="_blank" rel="noreferrer">{data.keyLocation} {Icon.external(12)}</a>
    </Row>
    <Row label={t("settings.submit_urls_manually")} help={t("settings.one_url_per_line_or")}>
      <Textarea rows={4} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={`${data.siteUrl}/bai-viet-moi`} />
      <div style={{ marginTop: 8 }}><Button variant="primary" loading={busy} disabled={!urls.trim()} onClick={submit}>{t("settings.submit_to_search_engines")}</Button></div>
    </Row>
    <div style={{ marginTop: 12 }}>
      <strong style={{ fontSize: 13 }}>{t("settings.submission_history")}</strong>
      <Table rows={data.history} rowKey={(r) => r.id} empty={<div className="ecx-muted" style={{ padding: 12 }}>{t("settings.nothing_submitted_yet")}</div>}
        columns={[
          { key: "time", title: t("settings.time"), width: 170, render: (r) => new Date(r.createdAt).toLocaleString() },
          { key: "urls", title: "URL", render: (r) => <span className="ecx-trunc ecx-mono">{r.urls[0]}{r.urls.length > 1 ? ` (+${r.urls.length - 1})` : ""}</span> },
          { key: "source", title: "", width: 90, render: (r) => <Badge>{r.source === "auto" ? t("settings.automatic") : t("settings.manual")}</Badge> },
          { key: "status", title: t("settings.result"), width: 260, render: (r) => <span style={{ color: r.status === 200 || r.status === 202 ? "var(--app-success)" : r.status === 0 ? "var(--app-muted)" : "var(--app-danger)" }}>{r.message}</span> },
        ]} />
    </div>
  </>);
}

export function SettingsPage() {
  const st = useSeoSettings();
  const { postTypes } = useContentTypes();
  const [tab, setTab] = useHashTab("links");
  const s = st.settings;
  const tabs = [
    { value: "links", label: t("settings.links") }, { value: "breadcrumbs", label: t("settings.breadcrumbs") }, { value: "images", label: t("settings.image_seo") },
    { value: "redirects", label: t("common.redirects") }, { value: "404", label: t("settings.404_monitor") }, { value: "webmaster", label: t("settings.site_verification") },
    { value: "analytics", label: t("settings.analysis") }, { value: "robots", label: "robots.txt" }, { value: "llms", label: "llms.txt" }, { value: "indexnow", label: "IndexNow" },
  ];
  const types = (list: string[] | undefined, key: Array<string>) => (
    <div className="ecx-flex">{postTypes.map((p) => (
      <Checkbox key={p.name} checked={(list ?? []).includes(p.name)} label={p.label}
        onChange={(v) => st.patch(key, v ? [...(list ?? []), p.name] : (list ?? []).filter((x) => x !== p.name))} />
    ))}</div>
  );
  return (
    <>
      <PageHeader title={t("settings.seo_settings")} />
      {!s ? <Loading /> : (
        <SettingsShell tabs={tabs} tab={tab} onTab={setTab} dirty={st.dirty} saving={st.saving} onSave={st.save} onReset={st.reset}>
          <Card>
            {tab === "links" && (<>
              <Row label={t("settings.external_links")}>
                <div className="ecx-grid" style={{ gap: 8 }}>
                  <Checkbox checked={s.general.externalNewTab} onChange={(v) => st.patch(["general", "externalNewTab"], v)} label={t("settings.open_external_links_in_a")} />
                  <Checkbox checked={s.general.nofollowExternal} onChange={(v) => st.patch(["general", "nofollowExternal"], v)} label={t("settings.add_nofollow_to_all_external")} />
                </div>
              </Row>
              {s.general.nofollowExternal && <Row label={t("settings.except_these_domains")} help={t("settings.one_domain_per_line_that")}><LinesInput value={s.general.nofollowExcludeDomains} onChange={(v) => st.patch(["general", "nofollowExcludeDomains"], v)} placeholder="doitac.vn" /></Row>}
              <Row label={t("settings.always_nofollow_these_domains")} help={t("settings.applies_even_when_nofollow_for")}><LinesInput value={s.general.nofollowDomains} onChange={(v) => st.patch(["general", "nofollowDomains"], v)} placeholder="quangcao.example" /></Row>
            </>)}

            {tab === "breadcrumbs" && (<>
              <Hint>{t("settings.insert_ecx_breadcrumbs_into_content")}</Hint>
              <Row label={t("settings.separator")}><Input style={{ width: 90 }} value={s.breadcrumbs.separator} onChange={(e) => st.patch(["breadcrumbs", "separator"], e.target.value)} /></Row>
              <Row label={t("settings.home")}><Checkbox checked={s.breadcrumbs.showHome} onChange={(v) => st.patch(["breadcrumbs", "showHome"], v)} label={t("settings.show_home_link")} />
                {s.breadcrumbs.showHome && <Input style={{ marginTop: 8 }} value={s.breadcrumbs.homeLabel} placeholder={t("settings.home")} onChange={(e) => st.patch(["breadcrumbs", "homeLabel"], e.target.value)} />}</Row>
              <Row label={t("settings.prefix")} help={t("settings.text_shown_before_the_breadcrumbs")}><Input value={s.breadcrumbs.prefix} onChange={(e) => st.patch(["breadcrumbs", "prefix"], e.target.value)} /></Row>
              <Row label={t("settings.archive_pages")} help={t("settings.s_author_name_date_leave")}><Input value={s.breadcrumbs.archiveFormat} placeholder={t("settings.archives_for_s")} onChange={(e) => st.patch(["breadcrumbs", "archiveFormat"], e.target.value)} /></Row>
              <Row label={t("settings.search_page")} help={t("settings.s_search_term")}><Input value={s.breadcrumbs.searchFormat} placeholder={t("settings.search_results_for_s")} onChange={(e) => st.patch(["breadcrumbs", "searchFormat"], e.target.value)} /></Row>
              <Row label={t("settings.404_page")}><Input value={s.breadcrumbs.notFoundLabel} placeholder={t("settings.page_not_found")} onChange={(e) => st.patch(["breadcrumbs", "notFoundLabel"], e.target.value)} /></Row>
              <Row label={t("settings.options")}>
                <div className="ecx-grid" style={{ gap: 8 }}>
                  <Checkbox checked={s.breadcrumbs.showAncestors} onChange={(v) => st.patch(["breadcrumbs", "showAncestors"], v)} label={t("settings.show_parent_categories")} />
                  <Checkbox checked={s.breadcrumbs.showPostTitle} onChange={(v) => st.patch(["breadcrumbs", "showPostTitle"], v)} label={t("settings.show_the_post_title_at")} />
                </div>
              </Row>
            </>)}

            {tab === "images" && (<>
              <Row label={t("settings.alt_text")} help={t("settings.variables_filename_file_name_title")}>
                <Checkbox checked={s.imageSeo.addMissingAlt} onChange={(v) => st.patch(["imageSeo", "addMissingAlt"], v)} label={t("settings.fill_in_missing_alt_text")} />
                <Input style={{ marginTop: 8 }} value={s.imageSeo.altFormat} onChange={(e) => st.patch(["imageSeo", "altFormat"], e.target.value)} />
              </Row>
              <Row label={t("settings.image_title")}>
                <Checkbox checked={s.imageSeo.addMissingTitle} onChange={(v) => st.patch(["imageSeo", "addMissingTitle"], v)} label={t("settings.fill_in_missing_image_titles")} />
                <Input style={{ marginTop: 8 }} value={s.imageSeo.titleFormat} onChange={(e) => st.patch(["imageSeo", "titleFormat"], e.target.value)} />
              </Row>
              <Row label={t("settings.on_upload")}><Checkbox checked={s.imageSeo.onUpload} onChange={(v) => st.patch(["imageSeo", "onUpload"], v)} label={t("settings.prefill_alt_text_and_title")} /></Row>
              <Row label={t("settings.change_case")}><Select value={s.imageSeo.caseChange} onChange={(e) => st.patch(["imageSeo", "caseChange"], e.target.value)}
                options={[{ value: "none", label: t("settings.keep_as_is") }, { value: "title", label: t("settings.title_case") }, { value: "sentence", label: t("settings.sentence_case") }, { value: "lower", label: t("settings.lowercase") }, { value: "upper", label: t("settings.uppercase") }]} /></Row>
            </>)}

            {tab === "redirects" && (<>
              <Row label={t("settings.automatic_redirects")}><Checkbox checked={s.redirections?.autoOnSlugChange ?? true} onChange={(v) => st.patch(["redirections", "autoOnSlugChange"], v)} label={t("settings.when_a_published_post_s")} /></Row>
              <Row label={t("settings.keep_query_string")}><Checkbox checked={s.redirections?.keepQuery ?? true} onChange={(v) => st.patch(["redirections", "keepQuery"], v)} label={t("settings.keep_query_parameters_utm_source")} /></Row>
              <Row label={t("settings.default_type")}><Select value={String(s.redirections?.defaultType ?? 301)} onChange={(e) => st.patch(["redirections", "defaultType"], Number(e.target.value))}
                options={[{ value: "301", label: t("settings.301_permanent") }, { value: "302", label: t("settings.302_temporary") }, { value: "307", label: t("settings.307_temporary") }]} /></Row>
            </>)}

            {tab === "404" && (<>
              <Row label={t("settings.mode")} help={t("settings.advanced_also_logs_the_referrer")}>
                <Select value={s.monitor404?.mode ?? "simple"} onChange={(e) => st.patch(["monitor404", "mode"], e.target.value)} options={[{ value: "simple", label: t("settings.simple") }, { value: "advanced", label: t("settings.advanced") }]} />
              </Row>
              <Row label={t("settings.row_limit")}><Input type="number" min={100} max={100000} style={{ width: 140 }} value={s.monitor404?.limit ?? 1000} onChange={(e) => st.patch(["monitor404", "limit"], Number(e.target.value))} /></Row>
              <Row label={t("settings.ignore_query_string")}><Checkbox checked={s.monitor404?.ignoreQuery ?? true} onChange={(v) => st.patch(["monitor404", "ignoreQuery"], v)} label={t("settings.merge_urls_that_differ_only")} /></Row>
              <Row label={t("settings.ignore_urls_containing")} help={t("settings.one_string_per_line_use")}><LinesInput value={s.monitor404?.ignore} onChange={(v) => st.patch(["monitor404", "ignore"], v)} placeholder="/old-" /></Row>
            </>)}

            {tab === "webmaster" && (<>
              <Hint>{t("settings.paste_the_content_value_of")}</Hint>
              {([["google", "Google Search Console"], ["bing", "Bing Webmaster Tools"], ["yandex", "Yandex"], ["baidu", "Baidu"], ["pinterest", "Pinterest"], ["norton", "Norton Safe Web"]] as const).map(([k, label]) => (
                <Row key={k} label={label}><Input value={(s.webmaster as any)[k]} onChange={(e) => st.patch(["webmaster", k], e.target.value.replace(/^.*content=["']([^"']+)["'].*$/s, "$1").trim())} /></Row>
              ))}
              <Row label={t("settings.other_meta_tags")} help={t("settings.paste_the_whole_meta_tag")}><Textarea rows={3} className="ecx-mono" value={s.webmaster.custom} onChange={(e) => st.patch(["webmaster", "custom"], e.target.value)} /></Row>
            </>)}

            {tab === "analytics" && (<>
              <Row label="Google Analytics 4" help={t("settings.measurement_id_like_g_xxxxxxx")}><Input value={s.analytics.ga4} placeholder="G-XXXXXXXXXX" onChange={(e) => st.patch(["analytics", "ga4"], e.target.value.trim())} /></Row>
              <Row label="Google Tag Manager" help={t("settings.container_id_like_gtm_xxxxxx")}><Input value={s.analytics.gtm} placeholder="GTM-XXXXXXX" onChange={(e) => st.patch(["analytics", "gtm"], e.target.value.trim())} /></Row>
              <Row label="Search Console" help={<>{t("settings.1_create_a_service_account")}<br />{t("settings.2_add_the_service_account")}<br />{t("settings.3_paste_the_json_key")}</>}>
                <Input value={s.analytics.searchConsoleProperty ?? ""} placeholder="sc-domain:example.com" onChange={(e) => st.patch(["analytics", "searchConsoleProperty"], e.target.value.trim())} />
                <Textarea rows={4} className="ecx-mono" style={{ marginTop: 8 }} value={s.analytics.serviceAccount ?? ""} placeholder={'{ "type": "service_account", "client_email": "…", "private_key": "…" }'}
                  onChange={(e) => st.patch(["analytics", "serviceAccount"], e.target.value)} />
                <div className="ecx-muted" style={{ marginTop: 4 }}>{t("settings.the_key_is_stored_on")}</div>
              </Row>
            </>)}

            {tab === "robots" && (<>
              <Row label={t("settings.edit_robots_txt")} help={t("settings.sitemap_lines_are_added_automatically")}>
                <Checkbox checked={s.robotsTxt.custom} onChange={(v) => { st.patch(["robotsTxt", "custom"], v); if (v && !s.robotsTxt.content) st.patch(["robotsTxt", "content"], DEFAULT_ROBOTS); }} label={t("settings.use_custom_content")} />
                {s.robotsTxt.custom && <Textarea rows={10} className="ecx-mono" style={{ marginTop: 8 }} value={s.robotsTxt.content} onChange={(e) => st.patch(["robotsTxt", "content"], e.target.value)} />}
                <a className="ecx-link ecx-muted" style={{ marginTop: 6 }} href="/robots.txt" target="_blank" rel="noreferrer">{t("settings.view_current_robots_txt")} {Icon.external(12)}</a>
              </Row>
            </>)}

            {tab === "llms" && (<>
              <Hint>{t("settings.llms_txt_helps_ai_assistants")}</Hint>
              <Row label={t("common.content_types")}>{types(s.llmsTxt.postTypes, ["llmsTxt", "postTypes"])}</Row>
              <Row label={t("settings.posts_per_type")}><Input type="number" min={5} max={200} style={{ width: 120 }} value={s.llmsTxt.limit} onChange={(e) => st.patch(["llmsTxt", "limit"], Number(e.target.value))} /></Row>
              <Row label={t("settings.extra_content")} help={t("settings.markdown_appended_at_the_end")}><Textarea rows={5} value={s.llmsTxt.extra} onChange={(e) => st.patch(["llmsTxt", "extra"], e.target.value)} /></Row>
            </>)}

            {tab === "indexnow" && (<>
              <Row label={t("settings.auto_submit")}><Checkbox checked={s.indexNow.autoSubmit} onChange={(v) => st.patch(["indexNow", "autoSubmit"], v)} label={t("settings.submit_urls_when_posts_are")} /></Row>
              <Row label={t("common.content_types")}>{types(s.indexNow.postTypes, ["indexNow", "postTypes"])}</Row>
              <IndexNowPanel />
            </>)}
          </Card>
        </SettingsShell>
      )}
    </>
  );
}
