import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Field, Input, Select, Tabs, api, useApi, type MetaBoxProps } from "@ecomcx/nexus-admin-sdk";
import { analyze, quickKeyword, type Check } from "../../frontend/lib/analysis";
import { META_KEY, postTypeSettings, type PostSeo, type SeoSettings } from "../../frontend/lib/settings";
import { extract } from "../../frontend/lib/text";
import { replaceVars, type VarContext } from "../../frontend/lib/vars";
import { SchemaList } from "./schema-editor";
import { API, Counter, Hint, Icon, ImageField, RobotsField, ScoreBadge, StatusIcon, TemplateInput } from "./ui";
import { t } from "./i18n";

const GROUPS: Array<{ id: Check["group"]; label: string }> = [
  { id: "basic", label: t("seoBox.basic_seo") }, { id: "additional", label: t("seoBox.additional") }, { id: "title", label: t("seoBox.title_description") }, { id: "readability", label: t("seoBox.readability") },
];

function SerpPreview({ title, description, url, date, keyword, siteName }: { title: string; description: string; url: string; date?: string; keyword?: string; siteName?: string }) {
  const [mobile, setMobile] = useState(false);
  let host = "", origin = "", path = "";
  try { const u = new URL(url); host = u.host; origin = u.origin; path = decodeURIComponent(u.pathname).split("/").filter(Boolean).join(" › "); } catch { /* bỏ qua */ }
  // Tô đậm từ khoá trong mô tả như Google
  const parts = keyword ? description.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")) : [description];
  return (
    <div>
      <div className="ecx-flex" style={{ marginBottom: 6 }}>
        <span className="ecx-muted">{t("seoBox.google_preview")}</span><span className="ecx-spacer" />
        <Button size="sm" variant={mobile ? "ghost" : "secondary"} onClick={() => setMobile(false)} aria-label={t("seoBox.desktop")}>{Icon.desktop(14)}</Button>
        <Button size="sm" variant={mobile ? "secondary" : "ghost"} onClick={() => setMobile(true)} aria-label={t("seoBox.mobile")}>{Icon.mobile(14)}</Button>
      </div>
      <div className={`ecx-serp${mobile ? " mobile" : ""}`}>
        <div className="ecx-serp-site"><span className="ecx-serp-favicon">{(siteName || host).slice(0, 1).toUpperCase()}</span><div><div>{siteName || host}</div><div className="ecx-serp-url">{origin}{path ? ` › ${path}` : ""}</div></div></div>
        <div className="ecx-serp-title">{title.length > 65 ? title.slice(0, 62).trimEnd() + "…" : title || t("seoBox.no_title_yet")}</div>
        <div className="ecx-serp-desc">{date && <span className="ecx-serp-date">{date} — </span>}{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</div>
      </div>
    </div>
  );
}

function KeywordsInput({ value, onChange }: { value: string[]; onChange(v: string[]): void }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const items = raw.split(",").map((x) => x.trim()).filter(Boolean).filter((x) => !value.some((v) => v.toLowerCase() === x.toLowerCase()));
    if (items.length) onChange([...value, ...items]);
    setText("");
  };
  return (
    <div className="ecx-keywords">
      {value.map((k, i) => (
        <span key={k} className={`ecx-chip${i === 0 ? " primary" : ""}`} title={i === 0 ? t("seoBox.focus_keyword") : t("seoBox.secondary_keywords")}>
          {i === 0 && Icon.star(12)}{k}
          {i > 0 && <button type="button" onClick={() => onChange([k, ...value.filter((x) => x !== k)])} aria-label={t("seoBox.make_focus_keyword")}>{Icon.star(12)}</button>}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== k))} aria-label={t("common.delete")}>{Icon.x(12)}</button>
        </span>
      ))}
      <input value={text} placeholder={value.length ? t("seoBox.add_a_secondary_keyword") : t("seoBox.type_the_focus_keyword_and")}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(text); } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1)); }}
        onBlur={() => text && add(text)} />
    </div>
  );
}

function SocialPreview({ kind, title, description, image, host }: { kind: "facebook" | "twitter"; title: string; description: string; image?: string; host: string }) {
  return (
    <div className={`ecx-social ${kind}`}>
      <div className="ecx-social-img" style={image ? { backgroundImage: `url("${image}")` } : undefined}>{!image && t("seoBox.no_image_the_featured_image")}</div>
      <div className="ecx-social-body"><div className="ecx-social-host">{host}</div><div className="ecx-social-title">{title}</div><div className="ecx-social-desc">{description}</div></div>
    </div>
  );
}

export function SeoBox(props: MetaBoxProps) {
  const { data: settings } = useApi<SeoSettings>(`${API}/settings`);
  const { data: boot } = useApi<{ site: { title: string; tagline: string; url: string } }>("/admin/bootstrap");
  const seo: PostSeo = props.meta[META_KEY] ?? {};
  const update = (patch: Partial<PostSeo>) => props.setMeta(META_KEY, { ...props.meta[META_KEY], ...patch });
  const [tab, setTab] = useState("general");
  const keywords = seo.focusKeywords ?? [];
  const kw = keywords[0] ?? "";

  // Chuyên mục của bài (để chọn chuyên mục chính)
  const catIds = props.terms?.category ?? [];
  const { data: cats } = useApi<{ items: Array<{ id: number; name: string }> }>(catIds.length > 1 ? "/admin/terms/category?pageSize=500" : null);

  // Từ khoá đã được bài khác dùng chưa (gọi máy chủ, trễ 600ms sau khi gõ)
  const [usedBy, setUsedBy] = useState<{ used: boolean; posts: Array<{ id: number; title: string; type: string }> } | null>(null);
  useEffect(() => {
    if (!kw) { setUsedBy(null); return; }
    const item = setTimeout(() => {
      api.get(`${API}/keyword-check?kw=${encodeURIComponent(kw)}&exclude=${props.post.id ?? 0}`).then(setUsedBy).catch(() => setUsedBy(null));
    }, 600);
    return () => clearTimeout(item);
  }, [kw, props.post.id]);

  const site = boot?.site ?? { title: "", tagline: "", url: props.siteUrl ?? "" };
  const typeCfg = postTypeSettings(settings, props.postType);
  const contentText = useMemo(() => extract(props.content as any).text, [props.content]);
  const vars: VarContext = {
    site: { title: site.title, tagline: site.tagline, url: site.url }, sep: settings?.general?.separator || "-",
    post: { id: props.post.id, type: props.postType, title: props.post.title, excerpt: props.excerpt, contentText, link: props.link, publishedAt: props.post.publishedAt ?? new Date().toISOString(), updatedAt: props.post.updatedAt },
    locale: props.locale,
  };
  const titleTpl = seo.title || typeCfg.title || "%title% %sep% %sitename%";
  const descTpl = seo.description || typeCfg.description || "%excerpt%";
  const title = replaceVars(titleTpl, vars);
  const description = replaceVars(descTpl, vars);
  const url = (props.siteUrl ?? site.url) + (props.link ?? "");

  const result = useMemo(() => analyze({
    keyword: kw, title, description, slug: props.post.slug ?? "", content: props.content as any, siteUrl: props.siteUrl ?? site.url,
    usedByOther: usedBy ? usedBy.used : null,
  }), [kw, title, description, props.post.slug, props.content, props.siteUrl, site.url, usedBy]);

  // Lưu điểm cùng bài (không đánh dấu "Chưa lưu") để danh sách bài và bảng điều khiển hiển thị
  const last = useRef<string>("");
  useEffect(() => {
    // Bài đã có: chờ nội dung tải xong mới chấm; bài mới chưa gõ nội dung vẫn chấm (tiêu đề, mô tả, đường dẫn)
    if (props.post.id && props.content === undefined) return;
    const score = kw ? result.score : undefined;
    const sig = `${score}|${result.links.internal}|${result.links.external}`;
    if (sig === last.current) return;
    last.current = sig;
    if (seo.score !== score || seo.links?.internal !== result.links.internal || seo.links?.external !== result.links.external)
      props.setMeta(META_KEY, { ...props.meta[META_KEY], score, links: result.links }, { silent: true });
  }, [kw, result.score, result.links.internal, result.links.external, props.content]);

  const [open, setOpen] = useState<Record<string, boolean>>({ basic: true });
  const host = (() => { try { return new URL(url).host; } catch { return ""; } })();
  const featured = props.featuredMedia?.url;

  if (settings && typeCfg.hideMetaBox) return <p className="ecx-muted" style={{ margin: 0 }}>{t("seoBox.the_seo_box_is_hidden")}</p>;

  return (
    <div className="ecx-box">
      <div className="ecx-box-head">
        <ScoreBadge score={kw ? result.score : null} size="lg" />
        <div><strong>{kw ? t("seoBox.seo_score") : t("seoBox.no_focus_keyword_yet")}</strong><div className="ecx-muted">{t("seoBox.words_internal_links_external_links", { wordCount: result.wordCount, internal: result.links.internal, external: result.links.external })}</div></div>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: "general", label: t("common.general") }, { value: "advanced", label: t("seoBox.advanced") }, { value: "social", label: t("seoBox.social") }, { value: "schema", label: t("seoBox.schema") }]} />
      <div style={{ paddingTop: 14 }}>
        {tab === "general" && (
          <div className="ecx-grid" style={{ gap: 14 }}>
            <SerpPreview siteName={site.title} title={title} description={description} url={url} keyword={kw} />
            <Field label={t("common.seo_title")} help={<Counter value={title} min={30} max={60} />}>
              <TemplateInput value={seo.title ?? ""} placeholder={typeCfg.title} onChange={(v) => update({ title: v || undefined })} />
            </Field>
            <Field label={t("common.seo_description")} help={<Counter value={description} min={120} max={160} />}>
              <TemplateInput multiline value={seo.description ?? ""} placeholder={typeCfg.description} onChange={(v) => update({ description: v || undefined })} />
            </Field>
            <Field label={t("seoBox.focus_keyword")} help={t("seoBox.the_first_keyword_is_the")}>
              <KeywordsInput value={keywords} onChange={(v) => update({ focusKeywords: v })} />
            </Field>
            {keywords.length > 1 && (
              <div className="ecx-grid" style={{ gap: 4 }}>
                {keywords.slice(1).map((k) => {
                  const q = quickKeyword(k, title, description, props.content as any);
                  return <div key={k} className="ecx-flex ecx-muted"><strong style={{ color: "var(--app-fg)" }}>{k}</strong>
                    <StatusIcon status={q.title ? "pass" : "warning"} />{t("seoBox.title")}<StatusIcon status={q.description ? "pass" : "warning"} />{t("seoBox.description")}<StatusIcon status={q.content ? "pass" : "warning"} />{t("seoBox.content")}</div>;
                })}
              </div>
            )}
            {usedBy?.used && <Hint tone="warn">{t("seoBox.this_keyword_is_already_the", { posts: usedBy.posts.map((p) => p.title).join(", ") })}</Hint>}
            {catIds.length > 1 && (
              <Field label={t("seoBox.primary_category")} help={t("seoBox.used_for_breadcrumbs_category_and")}>
                <Select value={String(seo.primaryTerm?.category ?? catIds[0])} onChange={(e) => update({ primaryTerm: { ...seo.primaryTerm, category: Number(e.target.value) } })}
                  options={catIds.map((id) => ({ value: String(id), label: cats?.items.find((c) => c.id === id)?.name ?? `#${id}` }))} />
              </Field>
            )}
            <Checkbox checked={!!seo.pillar} onChange={(v) => update({ pillar: v || undefined })} label={t("seoBox.pillar_content")} description={t("seoBox.the_most_important_post_on")} />
            <div>
              {GROUPS.map((g) => {
                const list = result.checks.filter((c) => c.group === g.id);
                if (!list.length) return null;
                const bad = list.filter((c) => c.status === "fail").length, warn = list.filter((c) => c.status === "warning").length;
                return (
                  <div key={g.id} className="ecx-group">
                    <button type="button" onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })}>
                      {g.label}<span className="ecx-spacer" />
                      {bad > 0 ? <span className="ecx-pill fail">{t("seoBox.errors", { bad })}</span> : warn > 0 ? <span className="ecx-pill warning">{t("seoBox.to_improve", { warn })}</span> : <span className="ecx-pill pass">{t("seoBox.good")}</span>}
                      <span style={{ transform: open[g.id] ? "rotate(180deg)" : undefined, display: "inline-flex" }}>{Icon.chevron(14)}</span>
                    </button>
                    {open[g.id] && <div className="ecx-checks">{list.map((c) => <div key={c.id} className="ecx-check"><StatusIcon status={c.status} /><span>{t(c.message, Object.fromEntries((c.args ?? []).map((a, i) => [i, a])))}</span></div>)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "advanced" && (
          <div className="ecx-grid" style={{ gap: 14 }}>
            <Field label={t("common.robots")}><RobotsField value={seo.robots} onChange={(v) => update({ robots: v })} allowDefault defaultLabel={t("seoBox.use_the_content_type_settings")} /></Field>
            <Field label={t("seoBox.advanced_snippet")} help={t("seoBox.1_no_limit")}>
              <div className="ecx-flex">
                <span className="ecx-muted">{t("seoBox.snippet_length")}</span><Input type="number" style={{ width: 90 }} value={seo.advancedRobots?.maxSnippet ?? ""} placeholder="-1" onChange={(e) => update({ advancedRobots: { ...seo.advancedRobots, maxSnippet: e.target.value === "" ? undefined : Number(e.target.value) } })} />
                <span className="ecx-muted">{t("seoBox.image_preview")}</span>
                <Select value={seo.advancedRobots?.maxImagePreview ?? ""} onChange={(e) => update({ advancedRobots: { ...seo.advancedRobots, maxImagePreview: (e.target.value || undefined) as any } })}
                  options={[{ value: "", label: t("seoBox.default") }, { value: "large", label: t("seoBox.large") }, { value: "standard", label: t("seoBox.standard") }, { value: "none", label: t("seoBox.none") }]} />
                <span className="ecx-muted">{t("seoBox.video_seconds")}</span><Input type="number" style={{ width: 90 }} value={seo.advancedRobots?.maxVideoPreview ?? ""} placeholder="-1" onChange={(e) => update({ advancedRobots: { ...seo.advancedRobots, maxVideoPreview: e.target.value === "" ? undefined : Number(e.target.value) } })} />
              </div>
            </Field>
            <Field label={t("seoBox.canonical_url")} help={t("seoBox.leave_empty_this_page_enter")}>
              <Input value={seo.canonical ?? ""} placeholder={url} onChange={(e) => update({ canonical: e.target.value || undefined })} />
            </Field>
            <Field label={t("seoBox.name_in_breadcrumbs")} help={t("seoBox.leave_empty_post_title")}>
              <Input value={seo.breadcrumbTitle ?? ""} placeholder={props.post.title} onChange={(e) => update({ breadcrumbTitle: e.target.value || undefined })} />
            </Field>
          </div>
        )}

        {tab === "social" && (
          <div className="ecx-grid-2">
            <div className="ecx-grid" style={{ gap: 12 }}>
              <strong>Facebook / Zalo</strong>
              <SocialPreview kind="facebook" host={host} title={seo.og?.title || title} description={seo.og?.description || description} image={seo.og?.image?.url || featured || settings?.social?.ogImage?.url} />
              <Field label={t("seoBox.title_2")}><Input value={seo.og?.title ?? ""} placeholder={title} onChange={(e) => update({ og: { ...seo.og, title: e.target.value || undefined } })} /></Field>
              <Field label={t("common.description")}><Input value={seo.og?.description ?? ""} placeholder={description} onChange={(e) => update({ og: { ...seo.og, description: e.target.value || undefined } })} /></Field>
              <Field label={t("seoBox.image")} help={t("seoBox.recommended_1200_630_leave_empty")}><ImageField value={seo.og?.image} onChange={(v) => update({ og: { ...seo.og, image: v } })} /></Field>
            </div>
            <div className="ecx-grid" style={{ gap: 12 }}>
              <strong>X (Twitter)</strong>
              <Checkbox checked={seo.twitter?.useOg !== false} onChange={(v) => update({ twitter: { ...seo.twitter, useOg: v } })} label={t("seoBox.same_as_facebook")} />
              {seo.twitter?.useOg === false && <>
                <SocialPreview kind="twitter" host={host} title={seo.twitter?.title || title} description={seo.twitter?.description || description} image={seo.twitter?.image?.url || featured} />
                <Field label={t("seoBox.card_type")}><Select value={seo.twitter?.card ?? ""} onChange={(e) => update({ twitter: { ...seo.twitter, card: (e.target.value || undefined) as any } })}
                  options={[{ value: "", label: t("seoBox.default") }, { value: "summary_large_image", label: t("seoBox.large_image") }, { value: "summary", label: t("seoBox.summary_small_image") }]} /></Field>
                <Field label={t("seoBox.title_2")}><Input value={seo.twitter?.title ?? ""} onChange={(e) => update({ twitter: { ...seo.twitter, title: e.target.value || undefined } })} /></Field>
                <Field label={t("common.description")}><Input value={seo.twitter?.description ?? ""} onChange={(e) => update({ twitter: { ...seo.twitter, description: e.target.value || undefined } })} /></Field>
                <Field label={t("seoBox.image")}><ImageField value={seo.twitter?.image} onChange={(v) => update({ twitter: { ...seo.twitter, image: v } })} /></Field>
              </>}
            </div>
          </div>
        )}

        {tab === "schema" && (
          <div className="ecx-grid" style={{ gap: 14 }}>
            {typeCfg.schemaType && typeCfg.schemaType !== "none" && ["Article", "BlogPosting", "NewsArticle"].includes(typeCfg.schemaType) && (
              <Checkbox checked={!seo.disableDefaultSchema} onChange={(v) => update({ disableDefaultSchema: !v || undefined })}
                label={t("seoBox.default_schema", { schemaType: typeCfg.schemaType })} description={t("seoBox.from_the_content_type_settings")} />
            )}
            <SchemaList value={(seo.schemas ?? []) as any} onChange={(v) => update({ schemas: v })} />
            <Hint>{t("seoBox.check_the_result_with_google")} <a className="ecx-link" href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">{t("seoBox.open_the_tool")} {Icon.external(12)}</a></Hint>
          </div>
        )}
      </div>
    </div>
  );
}
