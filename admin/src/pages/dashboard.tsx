import { __, Button, Card, PageHeader, Switch, can, useApi } from "@cms/admin-sdk";
import { API, Loading, ScoreBadge, useSeoSettings } from "../ui";

interface Stats {
  posts: { total: number; good: number; ok: number; bad: number; unscored: number; noDescription: number; noKeyword: number };
  redirects: { count: number; hits: number };
  notFound: { count: number; hits: number; lastWeek: number };
  audit: { score: number; at: string } | null;
}

/** Module bật/tắt + trang cài đặt tương ứng. */
export const MODULES: Array<{ key: string; title: string; description: string; link?: string }> = [
  { key: "schema", title: "Schema (dữ liệu có cấu trúc)", description: "JSON-LD cho tổ chức, website, bài viết, breadcrumbs và schema tự thêm (FAQ, sản phẩm, sự kiện…).", link: "/ecx-seo/schema" },
  { key: "sitemap", title: "Sitemap", description: "Tuỳ chỉnh sitemap.xml: loại nội dung, ảnh, loại trừ trang noindex.", link: "/ecx-seo/sitemap" },
  { key: "redirections", title: "Chuyển hướng", description: "301/302/307/410, khớp theo mẫu hoặc biểu thức chính quy, tự tạo khi đổi đường dẫn.", link: "/ecx-seo/redirects" },
  { key: "monitor404", title: "Theo dõi 404", description: "Ghi nhận liên kết hỏng để sửa hoặc chuyển hướng.", link: "/ecx-seo/404" },
  { key: "breadcrumbs", title: "Breadcrumbs", description: "Đường dẫn điều hướng [ecx_breadcrumbs] + schema BreadcrumbList.", link: "/ecx-seo/settings?tab=breadcrumbs" },
  { key: "imageSeo", title: "SEO hình ảnh", description: "Tự điền văn bản thay thế (alt) và tiêu đề ảnh theo mẫu.", link: "/ecx-seo/settings?tab=images" },
  { key: "indexNow", title: "Lập chỉ mục nhanh (IndexNow)", description: "Báo Bing, Yandex… ngay khi đăng hoặc sửa bài.", link: "/ecx-seo/settings?tab=indexnow" },
  { key: "localSeo", title: "Local SEO", description: "Địa chỉ, giờ mở cửa, toạ độ cho doanh nghiệp có cửa hàng.", link: "/ecx-seo/schema" },
  { key: "newsSitemap", title: "Sitemap tin tức", description: "news-sitemap.xml cho Google News (bài 2 ngày gần nhất).", link: "/ecx-seo/sitemap" },
  { key: "videoSitemap", title: "Sitemap & schema video", description: "Tự nhận diện video trong bài → video-sitemap.xml và VideoObject.", link: "/ecx-seo/sitemap" },
  { key: "analytics", title: "Google Analytics & Search Console", description: "Gắn mã GA4/Tag Manager, xem lượt nhấp và thứ hạng từ khoá.", link: "/ecx-seo/settings?tab=analytics" },
  { key: "linkCounter", title: "Đếm liên kết", description: "Đếm liên kết trong/ngoài của mỗi bài khi soạn." },
  { key: "llmsTxt", title: "llms.txt", description: "Tóm tắt website cho các trợ lý AI tại /llms.txt.", link: "/ecx-seo/settings?tab=llms" },
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
      <PageHeader title={__("SEO")} description={__("Tổng quan tối ưu tìm kiếm của website.")}
        actions={<Button variant="secondary" onClick={() => go("/ecx-seo/analysis")}>{__("Phân tích website")}</Button>} />
      {!stats ? <Loading /> : (
        <div className="ecx-stats" style={{ marginBottom: 16 }}>
          <div className="ecx-stat">
            <div className="ecx-stat-label">{__("Điểm SEO của bài đã đăng")}</div>
            <div className="ecx-stat-value">{p!.total}</div>
            <div className="ecx-bars" title={__("Tốt / Trung bình / Kém / Chưa chấm")}>
              <span style={{ width: pct(p!.good), background: "var(--app-success)" }} />
              <span style={{ width: pct(p!.ok), background: "var(--app-warning)" }} />
              <span style={{ width: pct(p!.bad), background: "var(--app-danger)" }} />
            </div>
            <div className="ecx-muted" style={{ marginTop: 6 }}>{__("{0} tốt · {1} trung bình · {2} kém · {3} chưa chấm", p!.good, p!.ok, p!.bad, p!.unscored)}</div>
          </div>
          <div className="ecx-stat">
            <div className="ecx-stat-label">{__("Thiếu mô tả / từ khoá")}</div>
            <div className="ecx-stat-value">{p!.noDescription} / {p!.noKeyword}</div>
            <button type="button" className="ecx-link" style={{ border: 0, background: "none", padding: 0, marginTop: 6, cursor: "pointer" }} onClick={() => go("/ecx-seo/bulk")}>{__("Sửa hàng loạt")} →</button>
          </div>
          <div className="ecx-stat">
            <div className="ecx-stat-label">{__("Lỗi 404 (7 ngày)")}</div>
            <div className="ecx-stat-value">{stats.notFound.lastWeek}</div>
            <div className="ecx-muted" style={{ marginTop: 6 }}>{__("{0} URL, {1} lượt truy cập", stats.notFound.count, stats.notFound.hits)}</div>
          </div>
          <div className="ecx-stat">
            <div className="ecx-stat-label">{__("Chuyển hướng đang bật")}</div>
            <div className="ecx-stat-value">{stats.redirects.count}</div>
            <div className="ecx-muted" style={{ marginTop: 6 }}>{__("{0} lượt chuyển hướng", stats.redirects.hits)}</div>
          </div>
          <div className="ecx-stat">
            <div className="ecx-stat-label">{__("Kết quả phân tích website")}</div>
            <div className="ecx-stat-value">{stats.audit ? <ScoreBadge score={stats.audit.score} size="lg" /> : "–"}</div>
            <div className="ecx-muted" style={{ marginTop: 6 }}>{stats.audit ? __("Lần cuối: {0}", new Date(stats.audit.at).toLocaleString()) : __("Chưa phân tích")}</div>
          </div>
        </div>
      )}

      <Card title={__("Module")} description={admin ? __("Bật đúng những gì website cần — module tắt không chạy và không làm chậm website.") : __("Chỉ quản trị viên được bật/tắt module.")}
        actions={st.dirty ? <Button variant="primary" loading={st.saving} onClick={st.save}>{__("Lưu thay đổi")}</Button> : undefined}>
        {!st.settings ? <Loading /> : (
          <div className="ecx-grid-3">
            {MODULES.map((m) => {
              const on = st.settings!.modules?.[m.key] !== false;
              return (
                <div key={m.key} className={`ecx-module${on ? "" : " off"}`}>
                  <h4><span style={{ flex: 1 }}>{__(m.title)}</span><Switch checked={on} disabled={!admin} onChange={(v) => toggle(m.key, v)} label={__(m.title)} /></h4>
                  <p>{__(m.description)}</p>
                  {m.link && on && <button type="button" className="ecx-link" style={{ border: 0, background: "none", padding: 0, cursor: "pointer", alignSelf: "flex-start" }} onClick={() => go(m.link!.split("?")[0] + (m.link!.includes("?") ? "?" + m.link!.split("?")[1] : ""))}>{__("Cài đặt")} →</button>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
