// Chữ hiển thị trên website (theo ngôn ngữ của website / trang đang xem). Người dùng ghi đè được trong cài đặt Breadcrumbs.
import type { Site } from "@cms/theme-sdk";

const VI = {
  home: "Trang chủ", page: "Trang", notFound: "Không tìm thấy trang", archive: "Lưu trữ cho %s", search: "Kết quả tìm kiếm cho %s",
  toc: "Mục lục", map: "Bản đồ", posts: "Bài viết", pages: "Trang", categories: "Chuyên mục",
  days: { Mo: "Thứ 2", Tu: "Thứ 3", We: "Thứ 4", Th: "Thứ 5", Fr: "Thứ 6", Sa: "Thứ 7", Su: "Chủ nhật" } as Record<string, string>,
  writtenBy: "Viết bởi", readingTime: "Thời gian đọc", minutes: "phút",
};
const EN: typeof VI = {
  home: "Home", page: "Page", notFound: "Page not found", archive: "Archives for %s", search: "Search results for %s",
  toc: "Table of contents", map: "Map", posts: "Posts", pages: "Pages", categories: "Categories",
  days: { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun" },
  writtenBy: "Written by", readingTime: "Time to read", minutes: "min",
};

export type Words = typeof VI;
export const words = (site: Pick<Site, "locale"> | { locale?: string | null }): Words => (String(site.locale ?? "").toLowerCase().startsWith("vi") ? VI : EN);
