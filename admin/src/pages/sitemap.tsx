import { __, Card, Checkbox, Input, PageHeader, useApi } from "@cms/admin-sdk";
import { Hint, Icon, IdsInput, Loading, Row, SettingsShell, useContentTypes, useSeoSettings } from "../ui";
import { useHashTab } from "./titles";

export function SitemapPage() {
  const st = useSeoSettings();
  const { postTypes, taxonomies } = useContentTypes();
  const { data: boot } = useApi<{ site: { url: string } }>("/admin/bootstrap");
  const [tab, setTab] = useHashTab("general");
  const s = st.settings;
  const site = (boot?.site.url ?? "").replace(/\/$/, "");
  const link = (path: string) => <a className="ecx-link" href={`${site}${path}`} target="_blank" rel="noreferrer">{site}{path} {Icon.external(12)}</a>;
  const tabs = [
    { value: "general", label: __("Chung") }, { value: "types", label: __("Loại nội dung") },
    { value: "news", label: __("Tin tức") }, { value: "video", label: __("Video") },
  ];
  const typeList = (list: string[] | undefined, key: string[]) => (
    <div className="ecx-flex">{postTypes.map((p) => (
      <Checkbox key={p.name} checked={(list ?? []).includes(p.name)} label={__(p.label)}
        onChange={(v) => st.patch(key, v ? [...(list ?? []), p.name] : (list ?? []).filter((x) => x !== p.name))} />
    ))}</div>
  );
  return (
    <>
      <PageHeader title={__("Sitemap")} description={__("Danh sách URL giúp máy tìm kiếm tìm thấy mọi trang quan trọng của website.")} />
      {!s ? <Loading /> : (
        <SettingsShell tabs={tabs} tab={tab} onTab={setTab} dirty={st.dirty} saving={st.saving} onSave={st.save} onReset={st.reset}>
          {s.modules?.sitemap === false && <Hint tone="warn">{__("Module Sitemap đang tắt — sitemap.xml dùng cấu hình mặc định của CMS.")}</Hint>}
          <Card>
            {tab === "general" && (<>
              <Row label={__("Địa chỉ sitemap")} help={__("Gửi địa chỉ này trong Google Search Console và Bing Webmaster Tools.")}>
                <div className="ecx-grid" style={{ gap: 4 }}>{link("/sitemap.xml")}</div>
              </Row>
              <Row label={__("Ảnh")}><Checkbox checked={s.sitemap.includeImages} onChange={(v) => st.patch(["sitemap", "includeImages"], v)} label={__("Thêm ảnh đại diện và ảnh trong nội dung vào sitemap")} /></Row>
              <Row label={__("Loại trừ bài")} help={__("ID bài/trang, cách nhau dấu phẩy. Bài noindex hoặc có canonical trỏ nơi khác tự bị loại.")}>
                <IdsInput value={s.sitemap.excludePosts} onChange={(v) => st.patch(["sitemap", "excludePosts"], v)} placeholder="12, 45" />
              </Row>
              <Row label={__("Loại trừ chuyên mục/thẻ")} help={__("ID, cách nhau dấu phẩy.")}>
                <IdsInput value={s.sitemap.excludeTerms} onChange={(v) => st.patch(["sitemap", "excludeTerms"], v)} placeholder="3, 8" />
              </Row>
            </>)}

            {tab === "types" && (<>
              <Hint>{__("Loại nội dung đặt noindex ở Tiêu đề & Meta sẽ không có trong sitemap.")}</Hint>
              {postTypes.map((p) => (
                <Row key={p.name} label={__(p.label)}>
                  <Checkbox checked={s.sitemap.postTypes?.[p.name] !== false} onChange={(v) => st.patch(["sitemap", "postTypes", p.name], v)} label={__("Có trong sitemap")} />
                </Row>
              ))}
              {taxonomies.map((t) => (
                <Row key={t.name} label={__(t.label)}>
                  <Checkbox checked={s.sitemap.taxonomies?.[t.name] !== false} onChange={(v) => st.patch(["sitemap", "taxonomies", t.name], v)} label={__("Có trong sitemap")} />
                </Row>
              ))}
            </>)}

            {tab === "news" && (<>
              {!s.modules?.newsSitemap && <Hint tone="warn">{__("Bật module Sitemap tin tức ở Bảng điều khiển SEO để dùng.")}</Hint>}
              <Row label={__("Địa chỉ")} help={__("Chỉ gồm bài đăng trong 2 ngày gần nhất, theo yêu cầu của Google News.")}>{link("/news-sitemap.xml")}</Row>
              <Row label={__("Tên ấn phẩm")} help={__("Để trống = tên website. Phải trùng tên đã đăng ký với Google News.")}>
                <Input value={s.sitemap.news.publicationName} onChange={(e) => st.patch(["sitemap", "news", "publicationName"], e.target.value)} />
              </Row>
              <Row label={__("Loại nội dung")}>{typeList(s.sitemap.news.postTypes, ["sitemap", "news", "postTypes"])}</Row>
              <Row label={__("Loại trừ chuyên mục")} help={__("ID chuyên mục không phải tin tức.")}>
                <IdsInput value={s.sitemap.news.excludeTerms} onChange={(v) => st.patch(["sitemap", "news", "excludeTerms"], v)} />
              </Row>
            </>)}

            {tab === "video" && (<>
              {!s.modules?.videoSitemap && <Hint tone="warn">{__("Bật module Sitemap & schema video ở Bảng điều khiển SEO để dùng.")}</Hint>}
              <Row label={__("Địa chỉ")} help={__("Tự nhận diện video tải lên, YouTube và Vimeo trong nội dung bài.")}>{link("/video-sitemap.xml")}</Row>
              <Row label={__("Loại nội dung")}>{typeList(s.sitemap.video.postTypes, ["sitemap", "video", "postTypes"])}</Row>
            </>)}
          </Card>
        </SettingsShell>
      )}
    </>
  );
}
