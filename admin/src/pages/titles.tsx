import { useState } from "react";
import { __, Card, Checkbox, Input, PageHeader, Select, useApi } from "@cms/admin-sdk";
import { postTypeSettings, taxonomySettings, type SeoSettings, type TypeSettings } from "../../../frontend/lib/settings";
import { replaceVars, type VarContext } from "../../../frontend/lib/vars";
import { Hint, ImageField, LinesInput, Loading, RobotsField, Row, SettingsShell, TemplateInput, useContentTypes, useSeoSettings } from "../ui";

export function useHashTab(fallback: string): [string, (t: string) => void] {
  const initial = new URLSearchParams(location.hash.split("?")[1] ?? "").get("tab") ?? fallback;
  const [tab, setTab] = useState(initial);
  return [tab, (t) => { setTab(t); history.replaceState(null, "", `${location.hash.split("?")[0]}?tab=${t}`); }];
}

const SEPARATORS = ["-", "–", "—", "|", "·", "•", "»", "/", "~", ":"];

function Preview({ s, title, description, sample }: { s: SeoSettings; title: string; description?: string; sample: Partial<VarContext> }) {
  const { data: boot } = useApi<{ site: { title: string; tagline: string; url: string } }>("/admin/bootstrap");
  const ctx: VarContext = {
    site: { title: boot?.site.title ?? "", tagline: boot?.site.tagline }, sep: s.general.separator || "-",
    post: { title: __("Tiêu đề bài mẫu"), excerpt: __("Đoạn tóm tắt mẫu của bài viết để xem trước mô tả."), publishedAt: new Date().toISOString(), categories: [__("Chuyên mục")], author: { name: __("Tác giả") } },
    term: { name: __("Tên chuyên mục"), description: __("Mô tả chuyên mục mẫu") }, author: { name: __("Tác giả"), bio: __("Giới thiệu tác giả") },
    search: __("từ khoá"), page: 2, totalPages: 5, dateLabel: __("Tháng 10/2026"), pageWord: __("Trang"), ...sample,
  };
  return (
    <div className="ecx-muted" style={{ marginTop: 6 }}>
      {__("Xem trước:")} <strong style={{ color: "var(--app-fg)" }}>{replaceVars(title, ctx)}</strong>
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
      <Row label={__("Mẫu tiêu đề")} help={__("Bấm % để chèn biến.")}>
        <TemplateInput value={value.title ?? ""} placeholder={defaults.title} onChange={(t) => onChange({ ...value, title: t || undefined })} />
        <Preview s={s} title={v.title ?? ""} sample={sample} />
      </Row>
      <Row label={__("Mẫu mô tả")} help={__("Dùng khi bài/trang chưa nhập mô tả SEO riêng.")}>
        <TemplateInput multiline value={value.description ?? ""} placeholder={defaults.description} onChange={(t) => onChange({ ...value, description: t || undefined })} />
      </Row>
      <Row label={__("Robots")} help={__("Áp dụng cho mọi trang thuộc loại này (bài riêng vẫn ghi đè được).")}>
        <Checkbox checked={!!value.noindex} onChange={(x) => onChange({ ...value, noindex: x || undefined })} label={__("Không index loại này (noindex) — đồng thời bỏ khỏi sitemap")} />
        <div style={{ marginTop: 8 }}><RobotsField value={value.robots ?? null} onChange={(r) => onChange({ ...value, robots: r })} allowDefault defaultLabel={__("Robots khác theo cài đặt chung")} /></div>
      </Row>
      {isPostType && (
        <Row label={__("Schema mặc định")} help={__("Loại dữ liệu có cấu trúc tự gắn cho mọi bài thuộc loại này.")}>
          <Select value={v.schemaType ?? "none"} onChange={(e) => onChange({ ...value, schemaType: e.target.value })}
            options={[{ value: "Article", label: "Article" }, { value: "BlogPosting", label: __("BlogPosting (bài blog)") }, { value: "NewsArticle", label: __("NewsArticle (tin tức)") }, { value: "WebPage", label: __("WebPage (trang thường)") }, { value: "none", label: __("Không") }]} />
        </Row>
      )}
      {isPostType && (
        <Row label={__("Hộp SEO trong trình soạn")}>
          <Checkbox checked={!value.hideMetaBox} onChange={(x) => onChange({ ...value, hideMetaBox: !x || undefined })} label={__("Hiện hộp SEO khi soạn loại này")} />
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
    { value: "global", label: __("Chung") }, { value: "home", label: __("Trang chủ") },
    ...postTypes.map((p) => ({ value: `pt:${p.name}`, label: __(p.label) })),
    ...taxonomies.map((t) => ({ value: `tax:${t.name}`, label: __(t.label) })),
    { value: "author", label: __("Tác giả") }, { value: "misc", label: __("Lưu trữ & khác") }, { value: "social", label: __("Mạng xã hội") },
  ];
  return (
    <>
      <PageHeader title={__("Tiêu đề & Meta")} description={__("Mẫu tiêu đề, mô tả và robots cho từng loại trang của website.")} />
      {!s ? <Loading /> : (
        <SettingsShell tabs={tabs} tab={tab} onTab={setTab} dirty={st.dirty} saving={st.saving} onSave={st.save} onReset={st.reset}>
          <Card>
            {tab === "global" && (<>
              <Row label={__("Ký tự phân cách")} help={__("Biến %sep% trong mẫu tiêu đề.")}>
                <div className="ecx-flex">{SEPARATORS.map((x) => (
                  <button key={x} type="button" onClick={() => st.patch(["general", "separator"], x)} className="ecx-chip" style={{ cursor: "pointer", padding: "4px 12px", fontSize: 15, ...(s.general.separator === x ? { borderColor: "var(--app-accent)", color: "var(--app-accent)" } : {}) }}>{x}</button>
                ))}<Input style={{ width: 70 }} value={s.general.separator} onChange={(e) => st.patch(["general", "separator"], e.target.value)} /></div>
              </Row>
              <Row label={__("Viết hoa tiêu đề")}><Checkbox checked={s.general.capitalizeTitles} onChange={(v) => st.patch(["general", "capitalizeTitles"], v)} label={__("Viết hoa chữ cái đầu mỗi từ trong thẻ tiêu đề")} /></Row>
              <Row label={__("Robots mặc định")} help={__("Áp dụng cho toàn website khi trang không có cài đặt riêng.")}><RobotsField value={s.general.robots} onChange={(v) => st.patch(["general", "robots"], v ?? {})} /></Row>
              <Row label={__("Đoạn trích nâng cao")} help={__("max-snippet, max-image-preview, max-video-preview — cho phép Google hiện đoạn trích và ảnh lớn.")}>
                <div className="ecx-flex">
                  <span className="ecx-muted">{__("Độ dài đoạn trích")}</span><Input type="number" style={{ width: 90 }} value={s.general.advancedRobots.maxSnippet ?? -1} onChange={(e) => st.patch(["general", "advancedRobots", "maxSnippet"], Number(e.target.value))} />
                  <span className="ecx-muted">{__("Ảnh xem trước")}</span>
                  <Select value={s.general.advancedRobots.maxImagePreview ?? "large"} onChange={(e) => st.patch(["general", "advancedRobots", "maxImagePreview"], e.target.value)} options={[{ value: "large", label: __("Lớn") }, { value: "standard", label: __("Chuẩn") }, { value: "none", label: __("Không") }]} />
                  <span className="ecx-muted">{__("Video (giây)")}</span><Input type="number" style={{ width: 90 }} value={s.general.advancedRobots.maxVideoPreview ?? -1} onChange={(e) => st.patch(["general", "advancedRobots", "maxVideoPreview"], Number(e.target.value))} />
                </div>
              </Row>
              <Row label={__("Không index tự động")}>
                <div className="ecx-grid" style={{ gap: 8 }}>
                  <Checkbox checked={s.general.noindexEmptyTerms} onChange={(v) => st.patch(["general", "noindexEmptyTerms"], v)} label={__("Chuyên mục/thẻ chưa có bài")} />
                  <Checkbox checked={s.general.noindexPaginated} onChange={(v) => st.patch(["general", "noindexPaginated"], v)} label={__("Trang phân trang (trang 2, 3…)")} />
                  <Checkbox checked={s.general.noindexArchiveSubpages} onChange={(v) => st.patch(["general", "noindexArchiveSubpages"], v)} label={__("Trang con của lưu trữ (chuyên mục, tác giả… trang 2 trở đi)")} />
                  <Checkbox checked={s.general.noindexSearch} onChange={(v) => st.patch(["general", "noindexSearch"], v)} label={__("Trang kết quả tìm kiếm")} />
                  <Checkbox checked={s.general.noindexPasswordProtected} onChange={(v) => st.patch(["general", "noindexPasswordProtected"], v)} label={__("Bài có mật khẩu")} />
                </div>
              </Row>
            </>)}

            {tab === "home" && (<>
              <Hint>{__("Áp dụng khi trang chủ hiển thị danh sách bài. Nếu trang chủ là một trang tĩnh, sửa SEO ngay trong trang đó.")}</Hint>
              <Row label={__("Mẫu tiêu đề")}><TemplateInput value={s.titles.home.title} onChange={(v) => st.patch(["titles", "home", "title"], v)} /><Preview s={s} title={s.titles.home.title} sample={{}} /></Row>
              <Row label={__("Mô tả")}><TemplateInput multiline value={s.titles.home.description} onChange={(v) => st.patch(["titles", "home", "description"], v)} /></Row>
              <Row label={__("Robots")}><RobotsField value={s.titles.home.robots} onChange={(v) => st.patch(["titles", "home", "robots"], v)} allowDefault /></Row>
              <Row label={__("Tiêu đề khi chia sẻ")}><Input value={s.titles.home.ogTitle} onChange={(e) => st.patch(["titles", "home", "ogTitle"], e.target.value)} /></Row>
              <Row label={__("Mô tả khi chia sẻ")}><Input value={s.titles.home.ogDescription} onChange={(e) => st.patch(["titles", "home", "ogDescription"], e.target.value)} /></Row>
              <Row label={__("Ảnh khi chia sẻ")} help={__("1200×630")}><ImageField value={s.titles.home.ogImage} onChange={(v) => st.patch(["titles", "home", "ogImage"], v)} /></Row>
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
              <Row label={__("Trang tác giả")}><Checkbox checked={!s.titles.author.disabled} onChange={(v) => st.patch(["titles", "author", "disabled"], !v)} label={__("Cho phép máy tìm kiếm index trang tác giả")} /></Row>
              <TypeEditor s={s} value={s.titles.author} defaults={{ title: "%name% %sep% %sitename%", description: "%user_description%" }} sample={{ post: null }}
                onChange={(v) => st.patch(["titles", "author"], { ...s.titles.author, ...v })} />
            </>)}

            {tab === "misc" && (<>
              <Row label={__("Lưu trữ theo ngày")}><Checkbox checked={!s.titles.date.disabled} onChange={(v) => st.patch(["titles", "date", "disabled"], !v)} label={__("Cho phép index trang lưu trữ theo ngày")} /></Row>
              <TypeEditor s={s} value={s.titles.date} defaults={{ title: "%date% %sep% %sitename%" }} sample={{ post: null }} onChange={(v) => st.patch(["titles", "date"], { ...s.titles.date, ...v })} />
              <Row label={__("Tiêu đề trang tìm kiếm")}><TemplateInput value={s.titles.search.title} onChange={(v) => st.patch(["titles", "search", "title"], v)} /><Preview s={s} title={s.titles.search.title} sample={{ post: null }} /></Row>
              <Row label={__("Tiêu đề trang 404")}><TemplateInput value={s.titles.notFound.title} onChange={(v) => st.patch(["titles", "notFound", "title"], v)} /><Preview s={s} title={s.titles.notFound.title} sample={{ post: null }} /></Row>
            </>)}

            {tab === "social" && (<>
              <Row label={__("Ảnh chia sẻ mặc định")} help={__("Dùng khi bài không có ảnh đại diện. 1200×630.")}><ImageField value={s.social.ogImage} onChange={(v) => st.patch(["social", "ogImage"], v)} /></Row>
              <Row label={__("Trang Facebook")}><Input value={s.social.facebookUrl} placeholder="https://facebook.com/…" onChange={(e) => st.patch(["social", "facebookUrl"], e.target.value)} /></Row>
              <Row label={__("Tài khoản X (Twitter)")}><Input value={s.social.twitterUsername} placeholder="@tencongty" onChange={(e) => st.patch(["social", "twitterUsername"], e.target.value)} /></Row>
              <Row label={__("Trang mạng xã hội khác")} help={__("Mỗi dòng một URL (YouTube, TikTok, LinkedIn, Zalo OA…) — đưa vào schema tổ chức.")}><LinesInput value={s.social.profiles} onChange={(v) => st.patch(["social", "profiles"], v)} placeholder="https://youtube.com/@…" /></Row>
              <Row label={__("Kiểu thẻ X (Twitter)")}><Select value={s.social.twitterCard} onChange={(e) => st.patch(["social", "twitterCard"], e.target.value)} options={[{ value: "summary_large_image", label: __("Ảnh lớn") }, { value: "summary", label: __("Tóm tắt (ảnh nhỏ)") }]} /></Row>
              <Row label="Facebook App ID"><Input value={s.social.facebookAppId} onChange={(e) => st.patch(["social", "facebookAppId"], e.target.value)} /></Row>
              <Row label="Facebook Admin ID"><Input value={s.social.facebookAdminId} onChange={(e) => st.patch(["social", "facebookAdminId"], e.target.value)} /></Row>
              <Row label={__("Chia sẻ nâng cao")}><Checkbox checked={s.social.slackEnhanced} onChange={(v) => st.patch(["social", "slackEnhanced"], v)} label={__("Hiện tác giả và thời gian đọc khi chia sẻ lên Slack, Discord…")} /></Row>
            </>)}
          </Card>
        </SettingsShell>
      )}
    </>
  );
}
