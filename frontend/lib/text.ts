// Đọc nội dung khối của CMS ({ blocks: [richtext (cây TipTap) | html | …] }) thành dữ liệu phân tích: chữ, tiêu đề, liên kết, ảnh, video.

export interface ContentDoc { version?: number; blocks?: Array<{ type: string; data?: any }> }
export interface Extracted {
  text: string;
  /** Đoạn văn (theo thứ tự). */
  paragraphs: string[];
  headings: Array<{ level: number; text: string }>;
  links: Array<{ href: string; text: string; rel?: string }>;
  images: Array<{ src: string; alt: string; title?: string }>;
  videos: Array<{ src: string; title?: string; poster?: string; kind: "file" | "youtube" | "vimeo" }>;
  /** Có mục lục (khối/shortcode toc). */
  hasToc: boolean;
}

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
export const stripTags = (html: string) => decode(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function nodeText(n: any): string {
  if (!n) return "";
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return " ";
  return (n.content ?? []).map(nodeText).join("");
}

function youtubeId(src: string) {
  return src.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/)?.[1] ?? null;
}

export function extract(doc: ContentDoc | null | undefined): Extracted {
  const out: Extracted = { text: "", paragraphs: [], headings: [], links: [], images: [], videos: [], hasToc: false };
  const texts: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    switch (n.type) {
      case "heading": { const t = nodeText(n).trim(); out.headings.push({ level: n.attrs?.level ?? 2, text: t }); texts.push(t); return; }
      case "paragraph": {
        const t = nodeText(n).trim();
        // Shortcode đứng riêng một dòng: [ecx_toc] = mục lục
        if (/^\[(ecx_)?toc\b/i.test(t)) { out.hasToc = true; return; }
        if (t) { out.paragraphs.push(t); texts.push(t); }
        break;
      }
      case "image": if (n.attrs?.src) out.images.push({ src: n.attrs.src, alt: n.attrs.alt ?? "", title: n.attrs.title ?? undefined }); return;
      case "gallery": for (const im of n.attrs?.images ?? []) if (im?.src) out.images.push({ src: im.src, alt: im.alt ?? "" }); return;
      case "video": if (n.attrs?.src) out.videos.push({ src: n.attrs.src, title: n.attrs.name ?? undefined, poster: n.attrs.poster ?? undefined, kind: "file" }); return;
      case "youtube": if (n.attrs?.src) out.videos.push({ src: n.attrs.src, kind: "youtube" }); return;
    }
    if (n.type === "text") {
      const link = (n.marks ?? []).find((m: any) => m.type === "link");
      if (link?.attrs?.href) out.links.push({ href: link.attrs.href, text: n.text ?? "", rel: link.attrs.rel ?? undefined });
    }
    for (const c of n.content ?? []) walk(c);
  };
  for (const b of doc?.blocks ?? []) {
    if (b.type === "richtext") walk(b.data);
    else if (b.type === "html") {
      const html = String(b.data?.html ?? "");
      for (const m of html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) out.headings.push({ level: Number(m[1]), text: stripTags(m[2]) });
      for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) { const t = stripTags(m[1]); if (t) out.paragraphs.push(t); }
      for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) out.links.push({ href: m[1], text: stripTags(m[2]), rel: m[0].match(/rel=["']([^"']+)/i)?.[1] });
      for (const m of html.matchAll(/<img\b[^>]*>/gi)) out.images.push({ src: m[0].match(/src=["']([^"']+)/i)?.[1] ?? "", alt: decode(m[0].match(/alt=["']([^"']*)/i)?.[1] ?? "") });
      for (const m of html.matchAll(/<iframe\b[^>]*src=["']([^"']+)["']/gi)) {
        const src = m[1];
        if (youtubeId(src)) out.videos.push({ src, kind: "youtube" });
        else if (/vimeo\.com/.test(src)) out.videos.push({ src, kind: "vimeo" });
      }
      if (/\[toc\b|class=["'][^"']*\btoc\b/i.test(html)) out.hasToc = true;
      texts.push(stripTags(html));
    } else if (b.type === "toc") out.hasToc = true;
  }
  out.text = texts.join(" ").replace(/\s+/g, " ").trim();
  return out;
}

/** Từ (chữ cái/số Unicode) — đếm đúng tiếng Việt. */
export const words = (s: string) => s.match(/[\p{L}\p{N}]+/gu) ?? [];
export const wordCount = (s: string) => words(s).length;

/** Câu (tách theo . ! ? …). */
export const sentences = (s: string) => s.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter((x) => wordCount(x) > 0);

/** Đoạn trích tự động ~155 ký tự, cắt ở ranh giới từ. */
export function autoExcerpt(text: string, max = 155) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[,;:\s]+$/, "") + "…";
}

/** Bỏ dấu tiếng Việt + chữ thường: so khớp từ khoá không phân biệt dấu (người dùng hay gõ không dấu trong URL). */
export function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

export const youtubeThumb = (src: string) => { const id = youtubeId(src); return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined; };
export const youtubeEmbed = (src: string) => { const id = youtubeId(src); return id ? `https://www.youtube.com/embed/${id}` : src; };

/** Thời gian đọc (phút), ~200 từ/phút. */
export const readingMinutes = (text: string) => Math.max(1, Math.round(wordCount(text) / 200));
