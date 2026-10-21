// Chấm điểm SEO nội dung theo từ khoá chính (0–100), chạy trực tiếp trong trình soạn khi người viết gõ.
import { extract, fold, sentences, wordCount, words, type ContentDoc } from "./text";

export type Status = "pass" | "warning" | "fail";
export interface Check {
  id: string;
  group: "basic" | "additional" | "title" | "readability";
  status: Status;
  /** Mẫu câu (tiếng Việt gốc) + tham số {0}, {1}… — admin dịch qua __(). */
  message: string;
  args?: Array<string | number>;
  weight: number;
}
export interface AnalysisInput {
  keyword: string;
  title: string;
  description: string;
  slug: string;
  content: ContentDoc | null | undefined;
  /** Gốc website để phân biệt liên kết trong/ngoài. */
  siteUrl: string;
  /** Từ khoá đã được bài khác dùng làm từ khoá chính (kết quả kiểm tra từ máy chủ). */
  usedByOther?: boolean | null;
}
export interface AnalysisResult { score: number; checks: Check[]; wordCount: number; links: { internal: number; external: number } }

const POWER_WORDS = [
  "bí mật", "bí quyết", "chứng minh", "đảm bảo", "độc quyền", "dễ dàng", "duy nhất", "hiệu quả", "hoàn hảo", "kinh ngạc", "mạnh mẽ", "miễn phí",
  "mới nhất", "nhanh chóng", "tốt nhất", "tuyệt vời", "toàn diện", "ưu đãi", "đáng kinh ngạc", "đơn giản", "chi tiết", "hướng dẫn", "cấp tốc", "gây sốc",
  "best", "free", "proven", "secret", "ultimate", "easy", "guide", "amazing", "essential", "complete", "powerful", "simple", "new", "exclusive", "instant",
];
const POSITIVE = ["tốt", "tuyệt", "hay", "thành công", "hiệu quả", "lợi ích", "dễ", "yêu", "vui", "đẹp", "nhanh", "an toàn", "best", "great", "easy", "love", "success", "amazing", "happy"];
const NEGATIVE = ["sai lầm", "tệ", "nguy hiểm", "cảnh báo", "thất bại", "lỗi", "tránh", "đừng", "khủng khiếp", "mất", "worst", "avoid", "mistake", "fail", "bad", "warning", "never", "danger"];

const includesFold = (hay: string, needle: string) => needle.length > 0 && fold(hay).includes(fold(needle));
const slugFold = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function analyze(input: AnalysisInput): AnalysisResult {
  const kw = input.keyword.trim();
  const ex = extract(input.content);
  const text = ex.text;
  const total = wordCount(text);
  const checks: Check[] = [];
  const add = (id: string, group: Check["group"], weight: number, status: Status, message: string, args?: Array<string | number>) =>
    checks.push({ id, group, weight, status, message, args });

  // Liên kết trong/ngoài
  let host = "";
  try { host = new URL(input.siteUrl).host; } catch { /* bỏ qua */ }
  const isExternal = (href: string) => /^https?:\/\//i.test(href) && (() => { try { return new URL(href).host !== host; } catch { return true; } })();
  const external = ex.links.filter((l) => isExternal(l.href));
  const internal = ex.links.filter((l) => !isExternal(l.href) && !/^(mailto:|tel:|#)/i.test(l.href));

  // ------------------------------------------------------------ SEO cơ bản
  if (!kw) {
    add("keyword", "basic", 10, "fail", "Chưa đặt từ khoá chính — nhập từ khoá bạn muốn bài xuất hiện trên Google");
  } else {
    add("kw-title", "basic", 8, includesFold(input.title, kw) ? "pass" : "fail",
      includesFold(input.title, kw) ? "score.the_seo_title_contains_the" : "score.the_seo_title_doesn_t");
    add("kw-description", "basic", 6, includesFold(input.description, kw) ? "pass" : "fail",
      includesFold(input.description, kw) ? "score.the_seo_description_contains_the" : "score.the_seo_description_doesn_t");
    const inUrl = slugFold(input.slug).includes(slugFold(kw));
    add("kw-url", "basic", 5, inUrl ? "pass" : "fail", inUrl ? "score.the_url_contains_the_focus" : "score.the_url_doesn_t_contain");
    const first = words(text).slice(0, Math.max(50, Math.ceil(total * 0.1))).join(" ");
    add("kw-intro", "basic", 6, includesFold(first, kw) ? "pass" : "fail",
      includesFold(first, kw) ? "score.the_keyword_appears_in_the" : "score.use_the_focus_keyword_in");
    add("kw-content", "basic", 6, includesFold(text, kw) ? "pass" : "fail",
      includesFold(text, kw) ? "score.the_content_contains_the_focus" : "score.the_content_doesn_t_contain");
  }
  add("length", "basic", 8, total >= 600 ? "pass" : total >= 300 ? "warning" : "fail",
    total >= 600 ? "score.the_content_is_words_long" : "score.the_content_is_only_words", [total]);

  // ------------------------------------------------------------ Bổ sung
  if (kw) {
    const inHeadings = ex.headings.some((h) => h.level >= 2 && h.level <= 4 && includesFold(h.text, kw));
    add("kw-subheading", "additional", 4, inHeadings ? "pass" : "warning", inHeadings ? "score.the_keyword_appears_in_subheadings" : "score.use_the_keyword_in_at");
    const inAlt = ex.images.some((i) => includesFold(i.alt, kw));
    add("kw-alt", "additional", 3, inAlt ? "pass" : "warning",
      ex.images.length === 0 ? "score.no_images_yet_add_an" : inAlt ? "score.image_alt_text_contains_the" : "score.add_the_keyword_to_the");
    const kwWords = Math.max(1, wordCount(kw));
    const occurrences = total === 0 ? 0 : (fold(text).match(new RegExp(fold(kw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    const density = total === 0 ? 0 : Math.round((occurrences * kwWords * 1000) / total) / 10;
    add("kw-density", "additional", 6, density >= 0.5 && density <= 2.5 ? "pass" : density > 2.5 ? "fail" : "warning",
      density > 2.5 ? "score.keyword_density_times_too_high" : density >= 0.5 ? "score.keyword_density_times_just_right" : "score.keyword_density_times_aim_for",
      [density, occurrences]);
    if (input.usedByOther != null)
      add("kw-unique", "additional", 4, input.usedByOther ? "warning" : "pass",
        input.usedByOther ? "score.this_keyword_is_already_the" : "score.no_other_post_uses_this");
  }
  add("url-length", "additional", 2, input.slug.length <= 75 ? "pass" : "warning",
    input.slug.length <= 75 ? "score.short_url_characters" : "score.the_url_is_characters_long", [input.slug.length]);
  add("external-links", "additional", 3, external.length > 0 ? "pass" : "warning",
    external.length > 0 ? "score.links_to_external_pages" : "score.link_to_reputable_external_sources", [external.length]);
  const dofollow = external.filter((l) => !/nofollow/i.test(l.rel ?? "")).length;
  if (external.length > 0)
    add("dofollow", "additional", 2, dofollow > 0 ? "pass" : "warning", dofollow > 0 ? "score.has_dofollow_external_links" : "score.all_external_links_are_nofollow");
  add("internal-links", "additional", 5, internal.length > 0 ? "pass" : "fail",
    internal.length > 0 ? "score.links_to_other_posts_on" : "score.link_to_other_posts_on", [internal.length]);

  // ------------------------------------------------------------ Tiêu đề
  const title = input.title.trim();
  if (kw) {
    const pos = fold(title).indexOf(fold(kw));
    add("kw-title-start", "title", 4, pos >= 0 && pos <= fold(title).length / 2 ? "pass" : "warning",
      pos >= 0 && pos <= fold(title).length / 2 ? "score.the_keyword_is_in_the" : "score.move_the_keyword_closer_to");
  }
  const lower = title.toLowerCase();
  const sentiment = POSITIVE.some((w) => lower.includes(w)) || NEGATIVE.some((w) => lower.includes(w));
  add("title-sentiment", "title", 2, sentiment ? "pass" : "warning", sentiment ? "score.the_title_carries_sentiment" : "score.neutral_title_add_emotional_words");
  const power = POWER_WORDS.some((w) => lower.includes(w));
  add("title-power", "title", 3, power ? "pass" : "warning", power ? "score.the_title_uses_power_words" : "score.add_power_words_e_g");
  const number = /\d/.test(title);
  add("title-number", "title", 2, number ? "pass" : "warning", number ? "score.the_title_contains_a_number" : "score.titles_with_numbers_tend_to");
  add("title-length", "title", 4, title.length >= 30 && title.length <= 60 ? "pass" : title.length === 0 ? "fail" : "warning",
    title.length >= 30 && title.length <= 60 ? "score.the_seo_title_is_characters" : "score.the_seo_title_is_characters_2", [title.length]);
  const d = input.description.trim().length;
  add("description-length", "title", 4, d >= 120 && d <= 160 ? "pass" : d === 0 ? "fail" : "warning",
    d >= 120 && d <= 160 ? "score.the_seo_description_is_characters" : "score.the_seo_description_is_characters_2", [d]);

  // ------------------------------------------------------------ Dễ đọc
  add("toc", "readability", 2, ex.hasToc ? "pass" : "warning", ex.hasToc ? "score.has_a_table_of_contents" : "score.long_posts_should_have_a");
  const longParas = ex.paragraphs.filter((p) => wordCount(p) > 120).length;
  add("short-paragraphs", "readability", 3, longParas === 0 ? "pass" : "warning",
    longParas === 0 ? "score.paragraphs_are_short_and_easy" : "score.paragraphs_are_longer_than_120", [longParas]);
  const longSentences = sentences(text).filter((s) => wordCount(s) > 30).length;
  const sentenceCount = Math.max(1, sentences(text).length);
  add("sentence-length", "readability", 2, longSentences / sentenceCount <= 0.25 ? "pass" : "warning",
    longSentences / sentenceCount <= 0.25 ? "score.sentences_are_a_reasonable_length" : "score.of_sentences_are_longer_than", [Math.round((longSentences * 100) / sentenceCount)]);
  const media = ex.images.length + ex.videos.length;
  add("media", "readability", 4, media > 0 ? "pass" : "warning", media > 0 ? "score.images_videos_illustrate_the_post" : "score.add_images_or_videos_to", [media]);

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + c.weight * (c.status === "pass" ? 1 : c.status === "warning" ? 0.5 : 0), 0);
  return { score: Math.round((got / totalWeight) * 100), checks, wordCount: total, links: { internal: internal.length, external: external.length } };
}

/** Kiểm tra nhanh từ khoá phụ: có trong tiêu đề / mô tả / nội dung không. */
export function quickKeyword(kw: string, title: string, description: string, content: ContentDoc | null | undefined) {
  const text = extract(content).text;
  return { title: includesFold(title, kw), description: includesFold(description, kw), content: includesFold(text, kw) };
}

export const scoreTone = (score: number | undefined | null): "green" | "yellow" | "red" | "gray" =>
  score == null ? "gray" : score >= 80 ? "green" : score >= 50 ? "yellow" : "red";
