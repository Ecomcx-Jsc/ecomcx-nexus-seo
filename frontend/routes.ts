// File ở gốc website do plugin phục vụ (khai báo trong plugin.json → frontend.routes).
import { getPosts, pluginFetch, type Post, type Site } from "@ecomcx/ecomweb-theme-sdk";
import { seoSettings } from "./lib/page";
import type { PostSeo } from "./lib/settings";
import { extract, stripTags, youtubeEmbed, youtubeThumb } from "./lib/text";
import { words } from "./lib/words";

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const xml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=600" } });
const text = (body: string) => new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=600" } });
const notFound = () => new Response("Not found", { status: 404 });
const visible = (p: Post) => !((p.extra as any)?.ecxSeo as PostSeo | undefined)?.robots?.noindex && !(p as any).passwordProtected;
const abs = (base: string, u: string) => (/^https?:\/\//.test(u) ? u : base + (u.startsWith("/") ? u : "/" + u));

async function recent(site: Site, types: string[], per: number, withContent = false) {
  const lists = await Promise.all(types.map((type) => getPosts({ type, perPage: per, orderBy: "date", order: "desc", withContent, locale: site.locale }).catch(() => ({ items: [] as Post[] }))));
  return lists.flatMap((l) => l.items).filter(visible);
}

/** Sitemap Google News: bài 2 ngày gần nhất (tối đa 1000). */
export async function newsSitemap(_req: Request, { site }: { site: Site }) {
  const s = seoSettings(site);
  if (!s?.modules?.newsSitemap) return notFound();
  const base = site.url.replace(/\/$/, "");
  const since = Date.now() - 2 * 86_400_000;
  const exclude = new Set((s.sitemap.news.excludeTerms ?? []).map(Number));
  const posts = (await recent(site, s.sitemap.news.postTypes?.length ? s.sitemap.news.postTypes : ["post"], 100))
    .filter((p) => p.publishedAt && Date.parse(p.publishedAt) >= since && !((p.terms?.category ?? []) as any[]).some((c) => exclude.has(c.id)))
    .slice(0, 1000);
  const name = s.sitemap.news.publicationName || site.title;
  return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${posts.map((p) => `  <url>
    <loc>${xmlEscape(abs(base, p.link))}</loc>
    <news:news>
      <news:publication><news:name>${xmlEscape(name)}</news:name><news:language>${xmlEscape(p.locale || site.locale)}</news:language></news:publication>
      <news:publication_date>${new Date(p.publishedAt!).toISOString()}</news:publication_date>
      <news:title>${xmlEscape(p.title)}</news:title>
    </news:news>
  </url>`).join("\n")}
</urlset>`);
}

/** Sitemap video: video trong nội dung bài (file tải lên, YouTube, Vimeo). */
export async function videoSitemap(_req: Request, { site }: { site: Site }) {
  const s = seoSettings(site);
  if (!s?.modules?.videoSitemap) return notFound();
  const base = site.url.replace(/\/$/, "");
  const posts = await recent(site, s.sitemap.video.postTypes?.length ? s.sitemap.video.postTypes : ["post", "page"], 200, true);
  const entries: string[] = [];
  for (const p of posts) {
    const videos = extract(p.content as any).videos;
    if (!videos.length) continue;
    const desc = stripTags(p.excerpt || "") || p.title;
    const thumbFallback = p.featuredMedia?.url ? abs(base, p.featuredMedia.url) : undefined;
    const tags = videos.map((v) => {
      const thumb = v.kind === "youtube" ? youtubeThumb(v.src) : v.poster ? abs(base, v.poster) : thumbFallback;
      if (!thumb) return "";
      return `    <video:video>
      <video:thumbnail_loc>${xmlEscape(thumb)}</video:thumbnail_loc>
      <video:title>${xmlEscape(v.title || p.title)}</video:title>
      <video:description>${xmlEscape(desc.slice(0, 2000))}</video:description>
      ${v.kind === "file" ? `<video:content_loc>${xmlEscape(abs(base, v.src))}</video:content_loc>` : `<video:player_loc>${xmlEscape(v.kind === "youtube" ? youtubeEmbed(v.src) : v.src)}</video:player_loc>`}
      ${p.publishedAt ? `<video:publication_date>${new Date(p.publishedAt).toISOString()}</video:publication_date>` : ""}
    </video:video>`;
    }).filter(Boolean);
    if (tags.length) entries.push(`  <url>\n    <loc>${xmlEscape(abs(base, p.link))}</loc>\n${tags.join("\n")}\n  </url>`);
  }
  return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${entries.join("\n")}\n</urlset>`);
}

/** llms.txt — tóm tắt website cho trợ lý AI (định dạng Markdown theo llmstxt.org). */
export async function llmsTxt(_req: Request, { site }: { site: Site }) {
  const s = seoSettings(site);
  if (!s?.modules?.llmsTxt) return notFound();
  const base = site.url.replace(/\/$/, "");
  const cfg = s.llmsTxt ?? { postTypes: ["post", "page"], limit: 50, extra: "" };
  const lines = [`# ${site.title}`, "", site.tagline ? `> ${site.tagline}` : "", ""];
  const w = words(site);
  const label: Record<string, string> = { post: w.posts, page: w.pages };
  for (const type of cfg.postTypes?.length ? cfg.postTypes : ["post", "page"]) {
    const items = await recent(site, [type], Math.min(200, cfg.limit || 50));
    if (!items.length) continue;
    lines.push(`## ${label[type] ?? type}`, "");
    for (const p of items) lines.push(`- [${p.title}](${abs(base, p.link)})${p.excerpt ? `: ${stripTags(p.excerpt).slice(0, 200)}` : ""}`);
    lines.push("");
  }
  if (cfg.extra?.trim()) lines.push(cfg.extra.trim(), "");
  return text(lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"));
}

/** Khoá xác minh IndexNow (lấy từ máy chủ). */
export async function indexNowKey(_req: Request, { site }: { site: Site }) {
  if (!seoSettings(site)?.modules?.indexNow) return notFound();
  try { return text((await pluginFetch<{ key: string }>("ecomcx-seo", "/indexnow/key", { noStore: true })).key); }
  catch { return notFound(); }
}
