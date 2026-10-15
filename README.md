# Ecomcx SEO

Plugin tối ưu tìm kiếm cho Ecomcx Nexus — một gói duy nhất, đủ tính năng.

## Tính năng

- **Tiêu đề & Meta**: mẫu tiêu đề/mô tả theo từng loại trang (bài, trang, loại nội dung riêng, chuyên mục, thẻ, tác giả, lưu trữ ngày, tìm kiếm, 404, trang chủ) với biến `%title%`, `%sep%`, `%sitename%`, `%excerpt%`, `%category%`, `%currentyear%`…; robots nâng cao; canonical; tự noindex trang rỗng, phân trang, tìm kiếm, bài có mật khẩu.
- **Hộp SEO khi soạn bài**: xem trước kết quả Google (máy tính/điện thoại), từ khoá chính + từ khoá phụ, điểm 0–100 cập nhật khi gõ (~30 tiêu chí), cảnh báo từ khoá đã dùng ở bài khác, chuyên mục chính, nội dung trụ cột, Open Graph / X (Twitter), schema riêng.
- **Schema JSON-LD**: Organization/Person, WebSite + tìm kiếm, WebPage, Article, BreadcrumbList, ảnh chính; 15 loại schema thêm cho từng bài (FAQ, HowTo, Product, Service, Event, Recipe, Course, JobPosting, SoftwareApplication, Book, VideoObject, LocalBusiness, Person, tuỳ chỉnh); mẫu schema tự áp theo loại nội dung/chuyên mục.
- **Sitemap**: chọn loại nội dung, loại trừ ID, ảnh, bỏ trang noindex/canonical nơi khác; `news-sitemap.xml` (Google News), `video-sitemap.xml`; sitemap HTML.
- **Chuyển hướng**: 301/302/307/410/451; khớp chính xác, chứa, bắt đầu, kết thúc, biểu thức chính quy (`$1`); nhiều nguồn một đích; tự tạo khi đổi đường dẫn bài đã đăng; nhập/xuất CSV; kiểm tra đường dẫn.
- **Theo dõi 404**: ghi URL, lượt, trang dẫn tới (chế độ nâng cao: trình duyệt, IP); bỏ qua theo mẫu; tạo chuyển hướng từ danh sách.
- **Breadcrumbs**, **SEO hình ảnh** (alt/title tự động), liên kết ngoài nofollow/tab mới, **robots.txt**, **llms.txt**.
- **Xác minh website** (Google, Bing, Yandex, Baidu, Pinterest, Norton), **Google Analytics 4 / Tag Manager**, **Google Search Console** (lượt nhấp, hiển thị, vị trí, theo dõi từ khoá).
- **Local SEO**: địa chỉ, toạ độ, giờ mở cửa → schema + shortcode.
- **IndexNow**: báo Bing, Yandex… khi đăng/sửa/xoá bài; gửi tay; lịch sử.
- **Phân tích website** và phân tích một trang bất kỳ; **sửa SEO hàng loạt**; cột SEO trong danh sách bài; widget bảng tin.
- **Công cụ**: sao lưu/nhập cài đặt, khôi phục mặc định, chuyển dữ liệu từ plugin SEO Toolkit và plugin Chuyển hướng.

Mỗi nhóm là một module bật/tắt ở **SEO › Bảng điều khiển**; module tắt không chạy.

## Shortcode

| Shortcode | Hiển thị |
|---|---|
| `[ecx_breadcrumbs]` | Breadcrumbs (khớp BreadcrumbList trong JSON-LD) |
| `[ecx_toc levels="2,3" title="Mục lục"]` | Mục lục theo tiêu đề trong bài |
| `[ecx_faq]` | Câu hỏi của schema FAQ trong bài |
| `[ecx_contact_info show="name,address,phone,email,hours,map"]` | Thông tin liên hệ từ Local SEO |
| `[ecx_html_sitemap types="page,post" limit="200"]` | Trang liệt kê nội dung cho người đọc |

## Phân quyền

| Capability | Mặc định | Cho phép |
|---|---|---|
| `ecx_seo_edit` | Quản trị viên, Biên tập viên, Tác giả | Hộp SEO, sửa hàng loạt, bảng điều khiển |
| `ecx_seo_redirects` | Quản trị viên, Biên tập viên | Chuyển hướng |
| `ecx_seo_404` | Quản trị viên, Biên tập viên | Theo dõi 404 |
| `ecx_seo_analysis` | Quản trị viên, Biên tập viên | Phân tích, Search Console |
| `ecx_seo_settings` | Quản trị viên | Cài đặt, schema, sitemap, công cụ |

## Dữ liệu

- Cài đặt: option `ecx_seo` (khoá tài khoản dịch vụ Google chỉ lưu ở máy chủ, không trả về trình duyệt).
- SEO của bài/chuyên mục: meta `_ecx_seo` (không ra API công khai; phần cần cho website nằm ở `extra.ecxSeo`).
- Bảng: `ecx_seo_redirects`, `ecx_seo_404`, `ecx_seo_indexnow` (xoá khi gỡ plugin).

## Cài đặt

Tải gói `ecomcx-seo-<phiên bản>.zip` lên ở **Plugin › Tải plugin lên**, rồi bật. Gỡ ở cùng trang (chọn giữ hoặc xoá dữ liệu).

## Phát triển

Mã nguồn nằm trong thư mục `plugins/ecomcx-seo` của Ecomcx Nexus (backend tham chiếu gói `Cms.Plugin.Sdk` ở `sdk/nuget` của repo đó):

```bash
npx create-cms pack plugins/ecomcx-seo        # build backend + admin → dist/ecomcx-seo-<phiên bản>.zip
python3 tests/plugins/ecomcx_seo_test.py      # kiểm thử API + website
node tests/e2e/ecomcx-seo-ui.mjs              # kiểm thử giao diện admin (vi/en)
```

Cấu trúc: `backend/` (C#, .NET 10), `admin/src/` (React, trang quản trị + hộp SEO), `frontend/` (React Server Components cho website: meta, JSON-LD, shortcode, route), `plugin.json` (khai báo + bản dịch tiếng Anh).
