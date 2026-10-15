import { useState } from "react";
import { __, Badge, Button, Card, Checkbox, Input, PageHeader, Select, Table, Textarea, api, notify, useApi } from "@cms/admin-sdk";
import { Hint, Icon, LinesInput, Loading, Row, SettingsShell, API, useContentTypes, useSeoSettings } from "../ui";
import { useHashTab } from "./titles";

const DEFAULT_ROBOTS = "User-agent: *\nAllow: /\nDisallow: /api/\n";

function IndexNowPanel() {
  const { data, reload } = useApi<{ key: string; keyLocation: string; siteUrl: string; history: Array<{ id: number; urls: string[]; status: number; message: string; source: string; createdAt: string }> }>(`${API}/indexnow`);
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const r = await api.post<{ status: number; message: string }>(`${API}/indexnow/submit`, { urls: urls.split("\n").map((x) => x.trim()).filter(Boolean) });
      (r.status === 200 || r.status === 202 ? notify.success : notify.info)(__(r.message));
      setUrls(""); reload();
    } catch (e) { notify.error((e as Error).message); } finally { setBusy(false); }
  }
  async function regenerate() {
    if (!confirm(__("Tạo khoá mới? Khoá cũ sẽ không dùng được nữa."))) return;
    await api.post(`${API}/indexnow/regenerate`); reload();
  }
  if (!data) return <Loading />;
  return (<>
    <Row label={__("Khoá API")} help={__("Máy tìm kiếm đọc khoá ở địa chỉ bên dưới để xác minh website.")}>
      <div className="ecx-flex"><code className="ecx-mono">{data.key}</code><Button size="sm" variant="ghost" onClick={regenerate}>{__("Tạo khoá mới")}</Button></div>
      <a className="ecx-link ecx-muted" href={data.keyLocation} target="_blank" rel="noreferrer">{data.keyLocation} {Icon.external(12)}</a>
    </Row>
    <Row label={__("Gửi URL thủ công")} help={__("Mỗi dòng một URL (hoặc đường dẫn /bai-viet).")}>
      <Textarea rows={4} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={`${data.siteUrl}/bai-viet-moi`} />
      <div style={{ marginTop: 8 }}><Button variant="primary" loading={busy} disabled={!urls.trim()} onClick={submit}>{__("Gửi tới máy tìm kiếm")}</Button></div>
    </Row>
    <div style={{ marginTop: 12 }}>
      <strong style={{ fontSize: 13 }}>{__("Lịch sử gửi")}</strong>
      <Table rows={data.history} rowKey={(r) => r.id} empty={<div className="ecx-muted" style={{ padding: 12 }}>{__("Chưa gửi lần nào")}</div>}
        columns={[
          { key: "time", title: __("Thời gian"), width: 170, render: (r) => new Date(r.createdAt).toLocaleString() },
          { key: "urls", title: "URL", render: (r) => <span className="ecx-trunc ecx-mono">{r.urls[0]}{r.urls.length > 1 ? ` (+${r.urls.length - 1})` : ""}</span> },
          { key: "source", title: "", width: 90, render: (r) => <Badge>{r.source === "auto" ? __("Tự động") : __("Thủ công")}</Badge> },
          { key: "status", title: __("Kết quả"), width: 260, render: (r) => <span style={{ color: r.status === 200 || r.status === 202 ? "var(--app-success)" : r.status === 0 ? "var(--app-muted)" : "var(--app-danger)" }}>{__(r.message)}</span> },
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
    { value: "links", label: __("Liên kết") }, { value: "breadcrumbs", label: __("Breadcrumbs") }, { value: "images", label: __("SEO hình ảnh") },
    { value: "redirects", label: __("Chuyển hướng") }, { value: "404", label: __("Theo dõi 404") }, { value: "webmaster", label: __("Xác minh website") },
    { value: "analytics", label: __("Phân tích") }, { value: "robots", label: "robots.txt" }, { value: "llms", label: "llms.txt" }, { value: "indexnow", label: "IndexNow" },
  ];
  const types = (list: string[] | undefined, key: Array<string>) => (
    <div className="ecx-flex">{postTypes.map((p) => (
      <Checkbox key={p.name} checked={(list ?? []).includes(p.name)} label={__(p.label)}
        onChange={(v) => st.patch(key, v ? [...(list ?? []), p.name] : (list ?? []).filter((x) => x !== p.name))} />
    ))}</div>
  );
  return (
    <>
      <PageHeader title={__("Cài đặt SEO")} />
      {!s ? <Loading /> : (
        <SettingsShell tabs={tabs} tab={tab} onTab={setTab} dirty={st.dirty} saving={st.saving} onSave={st.save} onReset={st.reset}>
          <Card>
            {tab === "links" && (<>
              <Row label={__("Liên kết ngoài")}>
                <div className="ecx-grid" style={{ gap: 8 }}>
                  <Checkbox checked={s.general.externalNewTab} onChange={(v) => st.patch(["general", "externalNewTab"], v)} label={__("Mở liên kết ngoài trong tab mới (thêm rel=\"noopener\")")} />
                  <Checkbox checked={s.general.nofollowExternal} onChange={(v) => st.patch(["general", "nofollowExternal"], v)} label={__("Thêm nofollow cho mọi liên kết ngoài")} />
                </div>
              </Row>
              {s.general.nofollowExternal && <Row label={__("Trừ các tên miền")} help={__("Mỗi dòng một tên miền vẫn giữ dofollow (đối tác, website của bạn).")}><LinesInput value={s.general.nofollowExcludeDomains} onChange={(v) => st.patch(["general", "nofollowExcludeDomains"], v)} placeholder="doitac.vn" /></Row>}
              <Row label={__("Luôn nofollow các tên miền")} help={__("Áp dụng kể cả khi không bật nofollow cho mọi liên kết ngoài.")}><LinesInput value={s.general.nofollowDomains} onChange={(v) => st.patch(["general", "nofollowDomains"], v)} placeholder="quangcao.example" /></Row>
            </>)}

            {tab === "breadcrumbs" && (<>
              <Hint>{__("Chèn [ecx_breadcrumbs] vào nội dung hoặc theme. Schema BreadcrumbList luôn được tạo khi module bật.")}</Hint>
              <Row label={__("Ký tự phân cách")}><Input style={{ width: 90 }} value={s.breadcrumbs.separator} onChange={(e) => st.patch(["breadcrumbs", "separator"], e.target.value)} /></Row>
              <Row label={__("Trang chủ")}><Checkbox checked={s.breadcrumbs.showHome} onChange={(v) => st.patch(["breadcrumbs", "showHome"], v)} label={__("Hiện liên kết trang chủ")} />
                {s.breadcrumbs.showHome && <Input style={{ marginTop: 8 }} value={s.breadcrumbs.homeLabel} placeholder={__("Trang chủ")} onChange={(e) => st.patch(["breadcrumbs", "homeLabel"], e.target.value)} />}</Row>
              <Row label={__("Tiền tố")} help={__("Chữ đứng trước breadcrumbs, vd \"Bạn đang ở:\"")}><Input value={s.breadcrumbs.prefix} onChange={(e) => st.patch(["breadcrumbs", "prefix"], e.target.value)} /></Row>
              <Row label={__("Trang lưu trữ")} help={__("%s = tên tác giả / ngày. Để trống = chữ mặc định theo ngôn ngữ website.")}><Input value={s.breadcrumbs.archiveFormat} placeholder={__("Lưu trữ cho %s")} onChange={(e) => st.patch(["breadcrumbs", "archiveFormat"], e.target.value)} /></Row>
              <Row label={__("Trang tìm kiếm")} help={__("%s = từ khoá")}><Input value={s.breadcrumbs.searchFormat} placeholder={__("Kết quả tìm kiếm cho %s")} onChange={(e) => st.patch(["breadcrumbs", "searchFormat"], e.target.value)} /></Row>
              <Row label={__("Trang 404")}><Input value={s.breadcrumbs.notFoundLabel} placeholder={__("Không tìm thấy trang")} onChange={(e) => st.patch(["breadcrumbs", "notFoundLabel"], e.target.value)} /></Row>
              <Row label={__("Tuỳ chọn")}>
                <div className="ecx-grid" style={{ gap: 8 }}>
                  <Checkbox checked={s.breadcrumbs.showAncestors} onChange={(v) => st.patch(["breadcrumbs", "showAncestors"], v)} label={__("Hiện chuyên mục cha")} />
                  <Checkbox checked={s.breadcrumbs.showPostTitle} onChange={(v) => st.patch(["breadcrumbs", "showPostTitle"], v)} label={__("Hiện tiêu đề bài ở cuối")} />
                </div>
              </Row>
            </>)}

            {tab === "images" && (<>
              <Row label={__("Văn bản thay thế (alt)")} help={__("Biến: %filename% (tên file), %title% (tiêu đề bài), %sitename%")}>
                <Checkbox checked={s.imageSeo.addMissingAlt} onChange={(v) => st.patch(["imageSeo", "addMissingAlt"], v)} label={__("Tự điền alt cho ảnh chưa có khi hiển thị")} />
                <Input style={{ marginTop: 8 }} value={s.imageSeo.altFormat} onChange={(e) => st.patch(["imageSeo", "altFormat"], e.target.value)} />
              </Row>
              <Row label={__("Tiêu đề ảnh (title)")}>
                <Checkbox checked={s.imageSeo.addMissingTitle} onChange={(v) => st.patch(["imageSeo", "addMissingTitle"], v)} label={__("Tự điền tiêu đề ảnh")} />
                <Input style={{ marginTop: 8 }} value={s.imageSeo.titleFormat} onChange={(e) => st.patch(["imageSeo", "titleFormat"], e.target.value)} />
              </Row>
              <Row label={__("Khi tải ảnh lên")}><Checkbox checked={s.imageSeo.onUpload} onChange={(v) => st.patch(["imageSeo", "onUpload"], v)} label={__("Điền sẵn alt và tiêu đề từ tên file khi tải lên thư viện")} /></Row>
              <Row label={__("Đổi chữ hoa/thường")}><Select value={s.imageSeo.caseChange} onChange={(e) => st.patch(["imageSeo", "caseChange"], e.target.value)}
                options={[{ value: "none", label: __("Giữ nguyên") }, { value: "title", label: __("Viết Hoa Mỗi Từ") }, { value: "sentence", label: __("Viết hoa chữ đầu câu") }, { value: "lower", label: __("chữ thường") }, { value: "upper", label: __("CHỮ IN HOA") }]} /></Row>
            </>)}

            {tab === "redirects" && (<>
              <Row label={__("Tự tạo chuyển hướng")}><Checkbox checked={s.redirections?.autoOnSlugChange ?? true} onChange={(v) => st.patch(["redirections", "autoOnSlugChange"], v)} label={__("Khi đổi đường dẫn bài đã đăng, tự chuyển hướng 301 từ đường dẫn cũ")} /></Row>
              <Row label={__("Giữ tham số")}><Checkbox checked={s.redirections?.keepQuery ?? true} onChange={(v) => st.patch(["redirections", "keepQuery"], v)} label={__("Giữ tham số truy vấn (?utm_source=…) khi chuyển hướng")} /></Row>
              <Row label={__("Mã mặc định")}><Select value={String(s.redirections?.defaultType ?? 301)} onChange={(e) => st.patch(["redirections", "defaultType"], Number(e.target.value))}
                options={[{ value: "301", label: __("301 – Vĩnh viễn") }, { value: "302", label: __("302 – Tạm thời") }, { value: "307", label: __("307 – Tạm thời") }]} /></Row>
            </>)}

            {tab === "404" && (<>
              <Row label={__("Chế độ")} help={__("Nâng cao: ghi thêm trang dẫn tới, trình duyệt và IP (dữ liệu cá nhân — cân nhắc quy định bảo vệ dữ liệu).")}>
                <Select value={s.monitor404?.mode ?? "simple"} onChange={(e) => st.patch(["monitor404", "mode"], e.target.value)} options={[{ value: "simple", label: __("Đơn giản") }, { value: "advanced", label: __("Nâng cao") }]} />
              </Row>
              <Row label={__("Giới hạn số dòng")}><Input type="number" min={100} max={100000} style={{ width: 140 }} value={s.monitor404?.limit ?? 1000} onChange={(e) => st.patch(["monitor404", "limit"], Number(e.target.value))} /></Row>
              <Row label={__("Bỏ qua tham số")}><Checkbox checked={s.monitor404?.ignoreQuery ?? true} onChange={(v) => st.patch(["monitor404", "ignoreQuery"], v)} label={__("Gộp các URL chỉ khác tham số truy vấn")} /></Row>
              <Row label={__("Bỏ qua URL chứa")} help={__("Mỗi dòng một chuỗi; dùng re: cho biểu thức chính quy, vd re:\\.php$")}><LinesInput value={s.monitor404?.ignore} onChange={(v) => st.patch(["monitor404", "ignore"], v)} placeholder="/old-" /></Row>
            </>)}

            {tab === "webmaster" && (<>
              <Hint>{__("Dán phần nội dung (content) của thẻ xác minh. Ví dụ với Google: <meta name=\"google-site-verification\" content=\"ABC…\"> → nhập ABC…")}</Hint>
              {([["google", "Google Search Console"], ["bing", "Bing Webmaster Tools"], ["yandex", "Yandex"], ["baidu", "Baidu"], ["pinterest", "Pinterest"], ["norton", "Norton Safe Web"]] as const).map(([k, label]) => (
                <Row key={k} label={label}><Input value={(s.webmaster as any)[k]} onChange={(e) => st.patch(["webmaster", k], e.target.value.replace(/^.*content=["']([^"']+)["'].*$/s, "$1").trim())} /></Row>
              ))}
              <Row label={__("Thẻ meta khác")} help={__("Dán nguyên thẻ <meta …> (chỉ nhận thẻ meta).")}><Textarea rows={3} className="ecx-mono" value={s.webmaster.custom} onChange={(e) => st.patch(["webmaster", "custom"], e.target.value)} /></Row>
            </>)}

            {tab === "analytics" && (<>
              <Row label="Google Analytics 4" help={__("Mã đo lường dạng G-XXXXXXX")}><Input value={s.analytics.ga4} placeholder="G-XXXXXXXXXX" onChange={(e) => st.patch(["analytics", "ga4"], e.target.value.trim())} /></Row>
              <Row label="Google Tag Manager" help={__("Mã vùng chứa dạng GTM-XXXXXX (dùng một trong hai)")}><Input value={s.analytics.gtm} placeholder="GTM-XXXXXXX" onChange={(e) => st.patch(["analytics", "gtm"], e.target.value.trim())} /></Row>
              <Row label="Search Console" help={<>{__("1. Tạo tài khoản dịch vụ trong Google Cloud, bật Search Console API, tải khoá JSON.")}<br />{__("2. Thêm email của tài khoản dịch vụ làm người dùng trong Search Console.")}<br />{__("3. Dán khoá JSON và property bên dưới.")}</>}>
                <Input value={s.analytics.searchConsoleProperty ?? ""} placeholder="sc-domain:example.com" onChange={(e) => st.patch(["analytics", "searchConsoleProperty"], e.target.value.trim())} />
                <Textarea rows={4} className="ecx-mono" style={{ marginTop: 8 }} value={s.analytics.serviceAccount ?? ""} placeholder={'{ "type": "service_account", "client_email": "…", "private_key": "…" }'}
                  onChange={(e) => st.patch(["analytics", "serviceAccount"], e.target.value)} />
                <div className="ecx-muted" style={{ marginTop: 4 }}>{__("Khoá được lưu ở máy chủ, không hiện lại trên trình duyệt (********).")}</div>
              </Row>
            </>)}

            {tab === "robots" && (<>
              <Row label={__("Chỉnh robots.txt")} help={__("Các dòng Sitemap được tự thêm. Khi website đang chặn máy tìm kiếm (Cài đặt › Đọc), robots.txt luôn chặn toàn bộ.")}>
                <Checkbox checked={s.robotsTxt.custom} onChange={(v) => { st.patch(["robotsTxt", "custom"], v); if (v && !s.robotsTxt.content) st.patch(["robotsTxt", "content"], DEFAULT_ROBOTS); }} label={__("Dùng nội dung tuỳ chỉnh")} />
                {s.robotsTxt.custom && <Textarea rows={10} className="ecx-mono" style={{ marginTop: 8 }} value={s.robotsTxt.content} onChange={(e) => st.patch(["robotsTxt", "content"], e.target.value)} />}
                <a className="ecx-link ecx-muted" style={{ marginTop: 6 }} href="/robots.txt" target="_blank" rel="noreferrer">{__("Xem robots.txt hiện tại")} {Icon.external(12)}</a>
              </Row>
            </>)}

            {tab === "llms" && (<>
              <Hint>{__("llms.txt giúp các trợ lý AI (ChatGPT, Claude, Perplexity…) hiểu nhanh nội dung website. Bật module llms.txt ở Bảng điều khiển.")}</Hint>
              <Row label={__("Loại nội dung")}>{types(s.llmsTxt.postTypes, ["llmsTxt", "postTypes"])}</Row>
              <Row label={__("Số bài mỗi loại")}><Input type="number" min={5} max={200} style={{ width: 120 }} value={s.llmsTxt.limit} onChange={(e) => st.patch(["llmsTxt", "limit"], Number(e.target.value))} /></Row>
              <Row label={__("Nội dung thêm")} help={__("Markdown, đặt ở cuối file (vd liên hệ, chính sách).")}><Textarea rows={5} value={s.llmsTxt.extra} onChange={(e) => st.patch(["llmsTxt", "extra"], e.target.value)} /></Row>
            </>)}

            {tab === "indexnow" && (<>
              <Row label={__("Tự động gửi")}><Checkbox checked={s.indexNow.autoSubmit} onChange={(v) => st.patch(["indexNow", "autoSubmit"], v)} label={__("Gửi URL khi đăng, sửa hoặc xoá bài")} /></Row>
              <Row label={__("Loại nội dung")}>{types(s.indexNow.postTypes, ["indexNow", "postTypes"])}</Row>
              <IndexNowPanel />
            </>)}
          </Card>
        </SettingsShell>
      )}
    </>
  );
}
