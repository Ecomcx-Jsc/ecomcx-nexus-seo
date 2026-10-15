// Biến trong mẫu tiêu đề/mô tả: "%title% %sep% %sitename%" → "Chào mừng - Cửa hàng Hoa Mai".

export interface VarContext {
  site: { title: string; tagline?: string; url?: string };
  sep: string;
  post?: {
    id?: number; type?: string; title?: string; excerpt?: string; contentText?: string; link?: string;
    publishedAt?: string | null; updatedAt?: string | null; author?: { name?: string; bio?: string | null } | null;
    categories?: string[]; tags?: string[]; meta?: Record<string, any>;
  } | null;
  term?: { name?: string; description?: string; taxonomy?: string } | null;
  author?: { name?: string; bio?: string | null } | null;
  search?: string | null;
  page?: number; totalPages?: number;
  /** Nhãn trang lưu trữ theo ngày (vd "Tháng 10/2026"). */
  dateLabel?: string;
  primaryCategory?: string;
  postTypeLabel?: string;
  locale?: string;
  formatDate?: (iso: string) => string;
  /** Chữ "Trang" theo ngôn ngữ (%page%). */
  pageWord?: string;
  notFoundTitle?: string;
}

/** Danh sách biến cho phần hướng dẫn trong admin. */
export const VARIABLES: Array<{ name: string; description: string }> = [
  { name: "%sitename%", description: "Tên website" },
  { name: "%sitedesc%", description: "Khẩu hiệu website" },
  { name: "%sep%", description: "Ký tự phân cách (Cài đặt chung)" },
  { name: "%title%", description: "Tiêu đề bài viết/trang" },
  { name: "%excerpt%", description: "Tóm tắt, hoặc đoạn đầu nội dung nếu chưa có tóm tắt" },
  { name: "%category%", description: "Chuyên mục chính của bài" },
  { name: "%categories%", description: "Mọi chuyên mục của bài, cách nhau dấu phẩy" },
  { name: "%tags%", description: "Các thẻ của bài" },
  { name: "%term%", description: "Tên chuyên mục/thẻ (trang lưu trữ)" },
  { name: "%term_description%", description: "Mô tả chuyên mục/thẻ" },
  { name: "%name%", description: "Tên tác giả" },
  { name: "%user_description%", description: "Giới thiệu tác giả" },
  { name: "%date%", description: "Ngày đăng (hoặc tên trang lưu trữ theo ngày)" },
  { name: "%modified%", description: "Ngày cập nhật" },
  { name: "%currentyear%", description: "Năm hiện tại" },
  { name: "%currentmonth%", description: "Tháng hiện tại" },
  { name: "%currentdate%", description: "Ngày hôm nay" },
  { name: "%page%", description: "\"Trang 2/5\" khi ở trang 2 trở đi, rỗng ở trang đầu" },
  { name: "%pagenumber%", description: "Số trang hiện tại" },
  { name: "%pagetotal%", description: "Tổng số trang" },
  { name: "%search_query%", description: "Từ khoá tìm kiếm" },
  { name: "%post_type%", description: "Tên loại nội dung" },
  { name: "%id%", description: "ID bài viết" },
  { name: "%url%", description: "Đường dẫn bài viết" },
  { name: "%customfield(tên)%", description: "Giá trị trường tuỳ chỉnh của bài" },
];

export function replaceVars(template: string | undefined | null, c: VarContext): string {
  if (!template) return "";
  const fmt = (iso?: string | null) => (iso ? (c.formatDate ? c.formatDate(iso) : new Date(iso).toLocaleDateString(c.locale ?? "vi")) : "");
  const now = new Date();
  const pageText = c.page && c.page > 1 ? `${c.pageWord ?? "Trang"} ${c.page}${c.totalPages && c.totalPages > 1 ? `/${c.totalPages}` : ""}` : "";
  const values: Record<string, string> = {
    sitename: c.site.title ?? "",
    sitedesc: c.site.tagline ?? "",
    sep: c.sep,
    title: c.post?.title ?? c.term?.name ?? "",
    excerpt: c.post?.excerpt?.trim() || (c.post?.contentText ? autoText(c.post.contentText) : ""),
    category: c.primaryCategory ?? c.post?.categories?.[0] ?? "",
    categories: (c.post?.categories ?? []).join(", "),
    tags: (c.post?.tags ?? []).join(", "),
    tag: c.post?.tags?.[0] ?? "",
    term: c.term?.name ?? "",
    term_description: (c.term?.description ?? "").trim(),
    name: c.author?.name ?? c.post?.author?.name ?? "",
    user_description: (c.author?.bio ?? c.post?.author?.bio ?? "").trim(),
    date: c.dateLabel ?? fmt(c.post?.publishedAt),
    modified: fmt(c.post?.updatedAt),
    currentyear: String(now.getFullYear()),
    currentmonth: String(now.getMonth() + 1).padStart(2, "0"),
    currentdate: fmt(now.toISOString()),
    page: pageText,
    pagenumber: String(c.page ?? 1),
    pagetotal: String(c.totalPages ?? 1),
    search_query: c.search ?? "",
    post_type: c.postTypeLabel ?? "",
    id: c.post?.id ? String(c.post.id) : "",
    url: c.post?.link ?? "",
    "404_title": c.notFoundTitle ?? "Không tìm thấy trang",
  };
  let out = template.replace(/%customfield\(([\w.-]+)\)%/g, (_, key) => {
    const v = c.post?.meta?.[key];
    return v == null || typeof v === "object" ? "" : String(v);
  });
  out = out.replace(/%([a-z0-9_]+)%/gi, (m, name: string) => (name.toLowerCase() in values ? values[name.toLowerCase()] : m));
  return cleanSeparators(out, c.sep);
}

/** Biến rỗng để lại dấu phân cách thừa: "  - Trang 2 -  - Site" → "Trang 2 - Site". */
export function cleanSeparators(s: string, sep: string) {
  let out = s.replace(/\s+/g, " ").trim();
  if (sep) {
    const e = sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?:\\s*${e}\\s*){2,}`, "g"), ` ${sep} `);
    out = out.replace(new RegExp(`^(?:\\s*${e}\\s*)+|(?:\\s*${e}\\s*)+$`, "g"), "");
  }
  return out.replace(/\s+/g, " ").trim();
}

function autoText(text: string, max = 155) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[,;:\s]+$/, "") + "…";
}

/** Viết hoa chữ đầu mỗi từ (tuỳ chọn "Viết hoa tiêu đề"). */
export const capitalize = (s: string) => s.replace(/(^|\s)(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase());
