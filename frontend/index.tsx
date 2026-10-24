import { definePlugin, type Block, type DocumentMetadata, type ShortcodeProps, type Site, type SlotProps } from "@ecomcx/nexus-theme-sdk";
import { Breadcrumbs, ContactInfo, Faq, HtmlSitemap, Toc } from "./components";
import { ogLocale, pageSeo, seoSettings } from "./lib/page";
import { buildGraph } from "./lib/schema";
import type { SeoSettings } from "./lib/settings";
import { extract, wordCount } from "./lib/text";
import { cleanSeparators } from "./lib/vars";
import { indexNowKey, llmsTxt, newsSitemap, videoSitemap } from "./routes";
import "./ecx-seo.css";
import { words } from "./lib/words";

/** JSON trong <script> an toàn: không để chuỗi "</script>" đóng thẻ sớm. */
const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(new RegExp("[\\u2028\\u2029]", "g"), "");

// ------------------------------------------------------------------ metadata của trang

async function metadata(meta: DocumentMetadata, { site, data }: Parameters<NonNullable<import("@ecomcx/nexus-theme-sdk").FilterMap["document.metadata"]>>[1]): Promise<DocumentMetadata> {
  const seo = await pageSeo(site, data);
  if (!seo) return meta;
  const s = seo.settings;
  const ps = seo.postSeo;
  const post = data.post;
  const isSingular = !!post && (data.kind === "single" || data.kind === "page" || data.kind === "front-page");
  const isHome = data.kind === "home" || data.kind === "front-page";
  const v = (t?: string) => (t ? cleanSeparators(t.replace(/%sitename%/g, site.title).replace(/%sep%/g, s.general.separator), s.general.separator) : "");

  // Ảnh chia sẻ: riêng của bài → ảnh đại diện → ảnh trang chủ → ảnh mặc định
  const fm = post?.featuredMedia;
  const large = fm?.sizes?.large ?? fm?.sizes?.["1536x1536"];
  const image = ps.og?.image?.url ? { url: ps.og.image.url, width: ps.og.image.width, height: ps.og.image.height, alt: ps.og.image.alt }
    : fm ? { url: large?.url ?? fm.url, width: large?.width ?? fm.width ?? undefined, height: large?.height ?? fm.height ?? undefined, alt: fm.alt || post?.title }
    : isHome && s.titles.home.ogImage?.url ? { url: s.titles.home.ogImage.url, width: s.titles.home.ogImage.width, height: s.titles.home.ogImage.height }
    : s.social.ogImage?.url ? { url: s.social.ogImage.url, width: s.social.ogImage.width, height: s.social.ogImage.height } : null;
  const ogTitle = ps.og?.title || (isHome ? v(s.titles.home.ogTitle) : "") || seo.title;
  const ogDescription = ps.og?.description || (isHome ? s.titles.home.ogDescription : "") || seo.description || undefined;
  const tw = ps.twitter ?? {};
  const useOg = tw.useOg !== false;

  const extra: Record<string, string> = { ...(meta.extra ?? {}) };
  // Chia sẻ trên Slack/Discord/Zalo hiện thêm tác giả + thời gian đọc
  if (isSingular && post && data.kind === "single" && s.social.slackEnhanced !== false) {
    const wordTotal = post.content ? wordCount(extract(post.content as any).text) : 0;
    if (post.author?.name) { extra["twitter:label1"] = words(site).writtenBy; extra["twitter:data1"] = post.author.name; }
    if (wordTotal) { extra["twitter:label2"] = words(site).readingTime; extra["twitter:data2"] = `${Math.max(1, Math.round(wordTotal / 200))} ${words(site).minutes}`; }
  }
  if (s.social.facebookAppId) extra["fb:app_id"] = s.social.facebookAppId;
  if (s.social.facebookAdminId) extra["fb:admins"] = s.social.facebookAdminId;
  // Mã xác minh khác + thẻ meta tuỳ chỉnh (chỉ nhận thẻ <meta name/property … content>)
  const wm = s.webmaster;
  if (wm.baidu) extra["baidu-site-verification"] = wm.baidu;
  if (wm.pinterest) extra["p:domain_verify"] = wm.pinterest;
  if (wm.norton) extra["norton-safeweb-site-verification"] = wm.norton;
  for (const m of (wm.custom ?? "").matchAll(/<meta\s+[^>]*>/gi)) {
    const name = m[0].match(/(?:name|property)=["']([^"']+)["']/i)?.[1];
    const content = m[0].match(/content=["']([^"']*)["']/i)?.[1];
    if (name && content != null) extra[name] = content;
  }

  const tags = isSingular ? ((post?.terms?.post_tag ?? []) as any[]).map((t) => t.name) : undefined;
  return {
    ...meta,
    title: seo.title,
    description: seo.description || meta.description,
    canonical: seo.canonical ?? meta.canonical,
    robots: seo.robots,
    openGraph: {
      ...meta.openGraph,
      title: ogTitle, description: ogDescription, url: seo.canonical ?? meta.canonical,
      type: data.kind === "single" ? "article" : "website", images: image ? [image] : undefined, image: image?.url,
      siteName: site.title, locale: ogLocale(site.locale),
      ...(data.kind === "single" && post ? {
        publishedTime: post.publishedAt ?? undefined, modifiedTime: post.updatedAt, section: seo.primary?.name, tags,
        authors: post.author?.name ? [post.author.name] : undefined,
      } : {}),
    },
    twitter: {
      card: tw.card ?? s.social.twitterCard ?? "summary_large_image",
      title: useOg ? ogTitle : tw.title || ogTitle, description: useOg ? ogDescription : tw.description || ogDescription,
      image: (useOg ? undefined : tw.image?.url) ?? image?.url,
      site: s.social.twitterUsername ? "@" + s.social.twitterUsername.replace(/^@/, "") : undefined,
    },
    verification: { google: wm.google || undefined, yandex: wm.yandex || undefined, other: wm.bing ? { "msvalidate.01": wm.bing } : undefined },
    extra,
  };
}

// ------------------------------------------------------------------ JSON-LD, Analytics

async function SchemaGraph({ site, data }: SlotProps) {
  if (!data || data.kind === "redirect") return null;
  const seo = await pageSeo(site, data);
  if (!seo || seo.settings.modules?.schema === false) return null;
  const base = site.url.replace(/\/$/, "");
  const post = data.post;
  const isSingular = !!post && (data.kind === "single" || data.kind === "page" || data.kind === "front-page");
  const graph = buildGraph({
    base, settings: seo.settings, site: { title: site.title, tagline: site.tagline, locale: site.locale }, kind: data.kind,
    url: seo.canonical ?? base + (data.basePath || "/"), title: seo.title, description: seo.description, crumbs: seo.crumbs,
    searchUrl: `${base}/?s={search_term_string}`, vars: seo.vars,
    post: isSingular && post ? {
      id: post.id, type: post.type, title: post.title, link: post.link, publishedAt: post.publishedAt, updatedAt: post.updatedAt,
      author: post.author ? { name: post.author.name, slug: post.author.slug, avatarUrl: post.author.avatarUrl, bio: post.author.bio } : null,
      featuredMedia: post.featuredMedia ? { url: post.featuredMedia.sizes?.large?.url ?? post.featuredMedia.url, width: post.featuredMedia.sizes?.large?.width ?? post.featuredMedia.width, height: post.featuredMedia.sizes?.large?.height ?? post.featuredMedia.height, alt: post.featuredMedia.alt } : null,
      categories: seo.categories.map((c) => ({ id: c.id, name: c.name })), tags: ((post.terms?.post_tag ?? []) as any[]).map((t) => t.name),
      content: post.content as any, seo: seo.postSeo,
    } : null,
  });
  if (!graph) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(graph) }} />;
}

function Analytics({ site }: SlotProps) {
  const a = seoSettings(site)?.analytics;
  const ga = a?.ga4 && /^G-[A-Z0-9]{4,20}$/i.test(a.ga4) ? a.ga4 : null;
  const gtm = a?.gtm && /^GTM-[A-Z0-9]{4,20}$/i.test(a.gtm) ? a.gtm : null;
  if (!ga && !gtm) return null;
  return (
    <>
      {ga && <script async src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} />}
      {ga && <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga}');` }} />}
      {gtm && <script dangerouslySetInnerHTML={{ __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');` }} />}
    </>
  );
}

function GtmNoScript({ site }: SlotProps) {
  const gtm = seoSettings(site)?.analytics?.gtm;
  if (!gtm || !/^GTM-[A-Z0-9]{4,20}$/i.test(gtm)) return null;
  return <noscript><iframe src={`https://www.googletagmanager.com/ns.html?id=${gtm}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} /></noscript>;
}

// ------------------------------------------------------------------ nội dung: alt ảnh, thuộc tính liên kết

function linkRules(site: Site, s: SeoSettings) {
  let host = "";
  try { host = new URL(site.url).host; } catch { /* bỏ qua */ }
  const g = s.general;
  const hostOf = (href: string) => { try { return new URL(href).host.toLowerCase(); } catch { return ""; } };
  const inList = (h: string, list: string[]) => list.some((d) => { const x = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""); return x && (h === x || h.endsWith("." + x)); });
  return (href: string, current: string | undefined): { rel?: string; target?: string } | null => {
    if (!/^https?:\/\//i.test(href)) return null;
    const h = hostOf(href);
    if (!h || h === host) return null;
    const rel = new Set((current ?? "").split(/\s+/).filter(Boolean));
    const nofollow = inList(h, g.nofollowDomains ?? []) || (g.nofollowExternal && !inList(h, g.nofollowExcludeDomains ?? []));
    if (nofollow) rel.add("nofollow");
    let target: string | undefined;
    if (g.externalNewTab) { target = "_blank"; rel.add("noopener"); }
    return { rel: rel.size ? [...rel].join(" ") : undefined, target };
  };
}

function imageAlt(s: SeoSettings, siteTitle: string, postTitle: string, src: string, format: string) {
  const file = decodeURIComponent(src.split("?")[0].split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return format.replace(/%filename%/g, file).replace(/%title%/g, postTitle).replace(/%sitename%/g, siteTitle).replace(/%count\(title\)%/g, "").replace(/\s+/g, " ").trim();
}

function transformBlocks(blocks: Block[], site: Site, postTitle: string): Block[] {
  const s = seoSettings(site);
  if (!s) return blocks;
  const links = linkRules(site, s);
  const img = s.modules?.imageSeo !== false ? s.imageSeo : null;
  const walk = (n: any): any => {
    if (!n || typeof n !== "object") return n;
    let node = n;
    if (img && n.type === "image" && n.attrs?.src) {
      const attrs = { ...n.attrs };
      if (img.addMissingAlt && !attrs.alt) attrs.alt = imageAlt(s, site.title, postTitle, attrs.src, img.altFormat || "%filename%");
      if (img.addMissingTitle && !attrs.title) attrs.title = imageAlt(s, site.title, postTitle, attrs.src, img.titleFormat || "%title%");
      node = { ...n, attrs };
    }
    if (n.type === "text" && n.marks?.some((m: any) => m.type === "link")) {
      node = { ...node, marks: n.marks.map((m: any) => {
        if (m.type !== "link") return m;
        const r = links(m.attrs?.href ?? "", m.attrs?.rel);
        return r ? { ...m, attrs: { ...m.attrs, rel: r.rel ?? m.attrs?.rel, target: r.target ?? m.attrs?.target } } : m;
      }) };
    }
    if (n.content) node = { ...node, content: n.content.map(walk) };
    return node;
  };
  return blocks.map((b) => {
    if (b.type === "richtext" && b.data) return { ...b, data: walk(b.data) };
    if (b.type === "html" && b.data?.html) {
      let html: string = b.data.html;
      if (img?.addMissingAlt) html = html.replace(/<img\b(?![^>]*\balt=)([^>]*)>/gi, (_m, rest) => `<img alt="${imageAlt(s, site.title, postTitle, rest.match(/src=["']([^"']+)/i)?.[1] ?? "", img.altFormat || "%filename%").replace(/"/g, "&quot;")}"${rest}>`);
      html = html.replace(/<a\b([^>]*\bhref=["'](https?:\/\/[^"']+)["'][^>]*)>/gi, (m, attrs, href) => {
        const r = links(href, attrs.match(/\brel=["']([^"']*)/i)?.[1]);
        if (!r) return m;
        let a = attrs.replace(/\s\brel=["'][^"']*["']/i, "").replace(/\s\btarget=["'][^"']*["']/i, "");
        if (r.rel) a += ` rel="${r.rel}"`;
        if (r.target) a += ` target="${r.target}"`;
        return `<a${a}>`;
      });
      return { ...b, data: { ...b.data, html } };
    }
    return b;
  });
}

// ------------------------------------------------------------------ robots.txt

function robotsTxt(content: string, { site }: { site: Site }) {
  const s = seoSettings(site);
  if (!s) return content;
  const base = site.url.replace(/\/$/, "");
  let out = s.robotsTxt?.custom && s.robotsTxt.content?.trim() ? s.robotsTxt.content.trim() + "\n" : content;
  const sitemaps = [`${base}/sitemap.xml`];
  if (s.modules?.newsSitemap) sitemaps.push(`${base}/news-sitemap.xml`);
  if (s.modules?.videoSitemap) sitemaps.push(`${base}/video-sitemap.xml`);
  for (const sm of sitemaps) if (!out.includes(sm)) out = out.trimEnd() + `\nSitemap: ${sm}\n`;
  return out;
}

// ------------------------------------------------------------------ shortcode breadcrumbs

async function BreadcrumbsShortcode({ site, post }: ShortcodeProps) {
  const s = seoSettings(site);
  if (!s || s.modules?.breadcrumbs === false || !post) return null;
  const seo = await pageSeo(site, { kind: post.type === "page" ? "page" : "single", post, title: post.title, page: 1, totalPages: 1, total: 1, basePath: post.link, templates: [], locale: post.locale, alternates: [] } as any);
  return seo ? <Breadcrumbs crumbs={seo.crumbs} separator={s.breadcrumbs.separator || "»"} prefix={s.breadcrumbs.prefix} /> : null;
}

export default definePlugin({
  filters: {
    "document.metadata": metadata,
    "robots.txt": robotsTxt,
    "post.blocks": (blocks, { site, post }) => transformBlocks(blocks, site, post?.title ?? ""),
  },
  slots: {
    head: Analytics,
    "body.start": GtmNoScript,
    "body.end": SchemaGraph,
  },
  shortcodes: {
    ecx_breadcrumbs: BreadcrumbsShortcode,
    ecx_toc: Toc,
    ecx_faq: Faq,
    ecx_contact_info: ContactInfo,
    ecx_html_sitemap: HtmlSitemap,
  },
  routes: {
    "/news-sitemap.xml": newsSitemap,
    "/video-sitemap.xml": videoSitemap,
    "/llms.txt": llmsTxt,
    "/indexnow-key.txt": indexNowKey,
  },
});
