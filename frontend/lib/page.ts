// Ngữ cảnh SEO của một trang: mẫu tiêu đề/mô tả đã thay biến, robots, canonical, breadcrumbs, chuyên mục chính.
import { formatDate, getTerms, type ResolveResult, type Site, type Term } from "@ecomcx/nexus-theme-sdk";
import type { PostSeo, Robots, SeoSettings } from "./settings";
import { postTypeSettings, taxonomySettings } from "./settings";
import { extract } from "./text";
import { capitalize, replaceVars, type VarContext } from "./vars";
import { words } from "./words";

export interface PageSeo {
  settings: SeoSettings;
  vars: VarContext;
  title: string;
  description: string;
  robots: string | undefined;
  noindex: boolean;
  canonical: string | undefined;
  crumbs: Array<{ name: string; url: string }>;
  postSeo: PostSeo;
  primary?: Term | null;
  categories: Term[];
}

export const seoSettings = (site: Site) => site.extra?.ecxSeo as unknown as SeoSettings | undefined;

const L = (site: Site) => words(site);

/** Chuyên mục của site (một lần mỗi request) để tìm chuyên mục chính và chuyên mục cha. */
async function allCategories(): Promise<Term[]> {
  try { return await getTerms("category", false); } catch { return []; }
}

export async function pageSeo(site: Site, data: ResolveResult): Promise<PageSeo | null> {
  const s = seoSettings(site);
  if (!s?.titles) return null;
  const post = data.post ?? null;
  const ps = ((post?.extra as any)?.ecxSeo ?? {}) as PostSeo;
  const termSeo = ((data.term?.extra as any)?.ecxSeo ?? {}) as PostSeo;
  const isSingular = !!post && (data.kind === "single" || data.kind === "page" || data.kind === "front-page");
  const lang = L(site);

  // Chuyên mục chính (chọn trong hộp SEO) hoặc chuyên mục đầu tiên; kèm chuỗi chuyên mục cha
  const cats = isSingular && post?.terms?.category?.length ? await allCategories() : [];
  const postCats = (post?.terms?.category ?? []) as Term[];
  const primaryId = ps.primaryTerm?.category;
  const primary = postCats.find((c) => c.id === primaryId) ?? postCats[0] ?? null;

  const content = isSingular ? extract(post?.content as any) : null;
  const vars: VarContext = {
    site: { title: site.title, tagline: site.tagline, url: site.url },
    sep: s.general?.separator || "-",
    post: post ? {
      id: post.id, type: post.type, title: post.title, excerpt: post.excerpt, contentText: content?.text, link: post.link,
      publishedAt: post.publishedAt, updatedAt: post.updatedAt, author: post.author ? { name: post.author.name, bio: post.author.bio } : null,
      categories: postCats.map((c) => c.name), tags: ((post.terms?.post_tag ?? []) as Term[]).map((t) => t.name), meta: post.meta as any,
    } : null,
    term: data.term ? { name: data.term.name, description: data.term.description, taxonomy: data.term.taxonomy } : null,
    author: data.author ? { name: data.author.name, bio: data.author.bio } : null,
    search: data.search, page: data.page, totalPages: data.totalPages,
    dateLabel: data.kind === "date" ? data.title : undefined,
    primaryCategory: primary?.name, locale: site.locale,
    formatDate: (iso) => formatDate(iso, site), pageWord: lang.page, notFoundTitle: lang.notFound,
  };

  // ------------------------------------------------------------ tiêu đề & mô tả theo loại trang
  const t = s.titles;
  let titleTpl: string, descTpl: string;
  let typeNoindex = false;
  let typeRobots: Robots | null | undefined;
  const isHome = data.kind === "home" || data.kind === "front-page";
  if (isHome && !(data.kind === "front-page" && ps.title)) {
    titleTpl = t.home.title; descTpl = t.home.description || (data.kind === "front-page" ? ps.description ?? "" : "") || "%sitedesc%";
    typeRobots = t.home.robots;
  } else if (isSingular && post) {
    const cfg = postTypeSettings(s, post.type);
    titleTpl = ps.title || cfg.title || "%title% %sep% %sitename%";
    descTpl = ps.description || cfg.description || "%excerpt%";
    typeNoindex = !!cfg.noindex; typeRobots = cfg.robots;
  } else if (data.term) {
    const cfg = taxonomySettings(s, data.term.taxonomy);
    titleTpl = termSeo.title || cfg.title || "%term% %sep% %sitename%";
    descTpl = termSeo.description || cfg.description || "%term_description%";
    typeNoindex = !!cfg.noindex; typeRobots = cfg.robots;
  } else if (data.kind === "author") {
    titleTpl = t.author.title ?? "%name% %sep% %sitename%"; descTpl = t.author.description ?? ""; typeNoindex = !!t.author.noindex;
  } else if (data.kind === "date") {
    titleTpl = t.date.title ?? "%date% %sep% %sitename%"; descTpl = t.date.description ?? ""; typeNoindex = !!t.date.noindex;
  } else if (data.kind === "search") {
    titleTpl = t.search.title; descTpl = "";
  } else if (data.kind === "404") {
    titleTpl = t.notFound.title; descTpl = "";
  } else {
    titleTpl = "%title% %sep% %page% %sep% %sitename%"; descTpl = "";
    vars.post = { ...(vars.post ?? {}), title: data.title };
  }
  let title = replaceVars(titleTpl, vars) || site.title;
  if (s.general?.capitalizeTitles) title = capitalize(title);
  const description = replaceVars(descTpl, vars).slice(0, 320);

  // ------------------------------------------------------------ robots
  const g = s.general;
  const r: Robots = { ...(g?.robots ?? {}), ...(typeRobots ?? {}), ...(isSingular ? ps.robots ?? {} : data.term ? termSeo.robots ?? {} : {}) };
  let noindex = !!r.noindex || typeNoindex;
  if (data.kind === "search" && g?.noindexSearch !== false) noindex = true;
  if (data.kind === "404") noindex = true;
  if ((data.page ?? 1) > 1 && g?.noindexPaginated) noindex = true;
  if ((data.page ?? 1) > 1 && g?.noindexArchiveSubpages && !isSingular) noindex = true;
  if (data.term && data.term.count === 0 && g?.noindexEmptyTerms !== false) noindex = true;
  if (isSingular && (post as any)?.passwordProtected && g?.noindexPasswordProtected !== false) noindex = true;
  if ((data.kind === "author" && t.author.disabled) || (data.kind === "date" && t.date.disabled)) noindex = true;
  const adv = { ...(g?.advancedRobots ?? {}), ...(isSingular ? ps.advancedRobots ?? {} : {}) };
  const parts = [noindex ? "noindex" : "index", r.nofollow ? "nofollow" : "follow"];
  if (r.noarchive) parts.push("noarchive");
  if (r.nosnippet) parts.push("nosnippet");
  if (r.noimageindex) parts.push("noimageindex");
  if (!noindex) {
    if (adv.maxSnippet != null) parts.push(`max-snippet:${adv.maxSnippet}`);
    if (adv.maxImagePreview) parts.push(`max-image-preview:${adv.maxImagePreview}`);
    if (adv.maxVideoPreview != null) parts.push(`max-video-preview:${adv.maxVideoPreview}`);
  }
  const robots = site.indexable === false ? "noindex, nofollow" : parts.join(", ");

  // ------------------------------------------------------------ canonical
  const base = site.url.replace(/\/$/, "");
  let canonical: string | undefined;
  if (isSingular && ps.canonical) canonical = ps.canonical;
  else if (data.term && termSeo.canonical) canonical = termSeo.canonical;
  else if (isSingular && post) canonical = data.kind === "front-page" ? "/" : post.link;
  else if (data.basePath != null && !["search", "404"].includes(data.kind))
    canonical = (data.page ?? 1) > 1 ? `${data.basePath.replace(/\/$/, "")}/page/${data.page}` : data.basePath || "/";
  if (canonical && !/^https?:\/\//.test(canonical)) canonical = base + (canonical.startsWith("/") ? canonical : "/" + canonical);

  // ------------------------------------------------------------ breadcrumbs
  const b = s.breadcrumbs;
  const crumbs: Array<{ name: string; url: string }> = [];
  if (b?.showHome !== false) crumbs.push({ name: b?.homeLabel || lang.home, url: base + "/" });
  const ancestors = (term: Term | null | undefined, list: Term[]) => {
    const chain: Term[] = [];
    let cur = term ? list.find((x) => x.id === term.id) ?? term : null;
    while (cur?.parentId && chain.length < 10) {
      const parent = list.find((x) => x.id === cur!.parentId);
      if (!parent) break;
      chain.unshift(parent);
      cur = parent;
    }
    return chain;
  };
  const fmt = (f: string | undefined, v: string, fallback = "%s") => (f || fallback).replace("%s", v);
  if (isSingular && post && data.kind !== "front-page") {
    if (primary && post.type === "post") {
      if (b?.showAncestors !== false) for (const a of ancestors(primary, cats)) crumbs.push({ name: a.name, url: base + a.link });
      crumbs.push({ name: primary.name, url: base + primary.link });
    }
    if (b?.showPostTitle !== false) crumbs.push({ name: ps.breadcrumbTitle || post.title, url: "" });
  } else if (data.term) {
    const list = data.term.taxonomy === "category" ? await allCategories() : [];
    if (b?.showAncestors !== false) for (const a of ancestors(data.term, list)) crumbs.push({ name: a.name, url: base + a.link });
    crumbs.push({ name: termSeo.breadcrumbTitle || data.term.name, url: "" });
  } else if (data.kind === "author" && data.author) crumbs.push({ name: fmt(b?.archiveFormat, data.author.name, lang.archive), url: "" });
  else if (data.kind === "date") crumbs.push({ name: fmt(b?.archiveFormat, data.title, lang.archive), url: "" });
  else if (data.kind === "search") crumbs.push({ name: fmt(b?.searchFormat, data.search ?? "", lang.search), url: "" });
  else if (data.kind === "404") crumbs.push({ name: b?.notFoundLabel || lang.notFound, url: "" });
  else if (!isHome && data.title) crumbs.push({ name: data.title, url: "" });

  return { settings: s, vars, title, description, robots, noindex, canonical, crumbs, postSeo: ps, primary, categories: postCats };
}

/** "vi" → "vi_VN" cho og:locale. */
export function ogLocale(code: string | undefined) {
  const map: Record<string, string> = { vi: "vi_VN", en: "en_US", ja: "ja_JP", ko: "ko_KR", zh: "zh_CN", fr: "fr_FR", de: "de_DE", es: "es_ES", th: "th_TH", id: "id_ID" };
  return code ? map[code.split("-")[0]] ?? code : undefined;
}
