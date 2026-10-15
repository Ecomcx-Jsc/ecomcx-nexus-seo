// Đồ thị JSON-LD cho mỗi trang (một <script> duy nhất, các thực thể liên kết qua @id như Google khuyến nghị).
import type { PostSeo, SchemaTemplate, SeoSettings } from "./settings";
import { postTypeSettings } from "./settings";
import { extract, youtubeEmbed, youtubeThumb, wordCount, type ContentDoc } from "./text";
import { replaceVars, type VarContext } from "./vars";

export interface Crumb { name: string; url: string }
type Obj = Record<string, any>;

export interface GraphInput {
  base: string;
  settings: SeoSettings;
  site: { title: string; tagline?: string; locale?: string };
  kind: string;
  url: string;
  title: string;
  description?: string;
  crumbs: Crumb[];
  post?: {
    id: number; type: string; title: string; link: string; publishedAt?: string | null; updatedAt?: string | null;
    author?: { name: string; slug?: string; avatarUrl?: string | null; bio?: string | null } | null;
    featuredMedia?: { url: string; width?: number | null; height?: number | null; alt?: string } | null;
    categories: Array<{ id: number; name: string }>; tags: string[];
    content?: ContentDoc | null; seo: PostSeo;
  } | null;
  vars: VarContext;
  searchUrl?: string;
}

const clean = (o: any): any => {
  if (Array.isArray(o)) { const a = o.map(clean).filter((x) => x !== undefined && x !== "" && !(typeof x === "object" && x && Object.keys(x).length === 0)); return a.length ? a : undefined; }
  if (o && typeof o === "object") {
    const r: Obj = {};
    for (const [k, v] of Object.entries(o)) { const c = clean(v); if (c !== undefined && c !== "" && c !== null && !(typeof c === "object" && !Array.isArray(c) && Object.keys(c).length === 0 && k !== "@context")) r[k] = c; }
    return r;
  }
  return o;
};

export function buildGraph(g: GraphInput): Obj | null {
  const s = g.settings;
  const abs = (u?: string | null) => (!u ? undefined : /^https?:\/\//.test(u) ? u : g.base + (u.startsWith("/") ? u : "/" + u));
  const lang = g.site.locale;
  const kg = s.knowledgeGraph;
  const graph: Obj[] = [];
  const v = (t?: string) => replaceVars(t ?? "", g.vars);

  // ---------------------------------------------------------- tổ chức / cá nhân
  const isPerson = kg.type === "person";
  const orgId = `${g.base}/#${isPerson ? "person" : "organization"}`;
  const sameAs = [s.social.facebookUrl, s.social.twitterUsername ? `https://twitter.com/${s.social.twitterUsername.replace(/^@/, "")}` : "", ...(s.social.profiles ?? [])].filter(Boolean);
  const logo = kg.logo?.url ? { "@type": "ImageObject", "@id": `${g.base}/#logo`, url: abs(kg.logo.url), contentUrl: abs(kg.logo.url), width: kg.logo.width, height: kg.logo.height, caption: kg.name || g.site.title, inLanguage: lang } : undefined;
  const local = s.modules?.localSeo && !isPerson;
  const address = kg.address?.street || kg.address?.locality ? {
    "@type": "PostalAddress", streetAddress: kg.address.street, addressLocality: kg.address.locality, addressRegion: kg.address.region,
    postalCode: kg.address.postalCode, addressCountry: kg.address.country,
  } : undefined;
  graph.push(isPerson ? {
    "@type": ["Person", "Organization"], "@id": orgId, name: kg.name || g.site.title, url: abs(kg.url) ?? g.base + "/", image: logo, logo, sameAs, description: kg.description,
  } : {
    "@type": local && kg.businessType && kg.businessType !== "Organization" ? kg.businessType : "Organization",
    "@id": orgId, name: kg.name || g.site.title, alternateName: kg.alternateName, url: abs(kg.url) ?? g.base + "/", logo, image: logo ? { "@id": `${g.base}/#logo` } : undefined,
    sameAs, description: kg.description, email: kg.email, telephone: kg.phone, foundingDate: kg.foundingDate,
    ...(local ? {
      address, priceRange: kg.priceRange,
      geo: kg.geo?.lat && kg.geo?.lng ? { "@type": "GeoCoordinates", latitude: Number(kg.geo.lat), longitude: Number(kg.geo.lng) } : undefined,
      openingHoursSpecification: (kg.openingHours ?? []).filter((h) => h.days?.length).map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: h.days.map(dayName), opens: h.opens, closes: h.closes })),
    } : { address }),
  });

  // ---------------------------------------------------------- website
  graph.push({
    "@type": "WebSite", "@id": `${g.base}/#website`, url: g.base + "/", name: g.site.title, description: g.site.tagline, publisher: { "@id": orgId }, inLanguage: lang,
    potentialAction: g.searchUrl ? { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: g.searchUrl }, "query-input": "required name=search_term_string" } : undefined,
  });

  // ---------------------------------------------------------- ảnh chính
  const p = g.post;
  const primary = p?.featuredMedia?.url;
  if (primary) graph.push({ "@type": "ImageObject", "@id": `${g.url}#primaryimage`, url: abs(primary), contentUrl: abs(primary), width: p!.featuredMedia!.width ?? undefined, height: p!.featuredMedia!.height ?? undefined, caption: p!.featuredMedia!.alt || undefined, inLanguage: lang });

  // ---------------------------------------------------------- breadcrumbs
  if (s.modules?.breadcrumbs !== false && g.crumbs.length > 1)
    graph.push({ "@type": "BreadcrumbList", "@id": `${g.url}#breadcrumb`, itemListElement: g.crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: i < g.crumbs.length - 1 || c.url ? abs(c.url) : undefined })) });

  // ---------------------------------------------------------- trang
  const pageType = g.kind === "search" ? "SearchResultsPage" : ["category", "tag", "taxonomy", "author", "date", "archive", "home"].includes(g.kind) ? "CollectionPage" : "WebPage";
  const webpage: Obj = {
    "@type": pageType, "@id": `${g.url}#webpage`, url: g.url, name: g.title, description: g.description, isPartOf: { "@id": `${g.base}/#website` },
    primaryImageOfPage: primary ? { "@id": `${g.url}#primaryimage` } : undefined, breadcrumb: g.crumbs.length > 1 ? { "@id": `${g.url}#breadcrumb` } : undefined,
    datePublished: p?.publishedAt ?? undefined, dateModified: p?.updatedAt ?? undefined, inLanguage: lang,
    about: g.kind === "front-page" || g.kind === "home" ? { "@id": orgId } : undefined,
  };
  graph.push(webpage);

  if (p) {
    // Tác giả
    const authorId = p.author ? `${g.base}/#author-${p.author.slug ?? p.author.name}` : undefined;
    if (p.author) graph.push({ "@type": "Person", "@id": authorId, name: p.author.name, url: p.author.slug ? abs(`/author/${p.author.slug}`) : undefined, image: p.author.avatarUrl ? { "@type": "ImageObject", url: abs(p.author.avatarUrl) } : undefined, description: p.author.bio || undefined });
    const ex = extract(p.content);

    // Schema mặc định theo loại bài (Article/BlogPosting/NewsArticle) — trừ khi bài tắt
    const typeCfg = postTypeSettings(s, p.type);
    const custom = (p.seo.schemas ?? []).filter((x) => x?.type);
    const hasArticleOverride = custom.some((x) => x.type === "Article");
    if (!p.seo.disableDefaultSchema && !hasArticleOverride && typeCfg.schemaType && ["Article", "BlogPosting", "NewsArticle"].includes(typeCfg.schemaType))
      graph.push(article(typeCfg.schemaType, {}, p, ex, g, orgId, authorId, abs, v));

    // Schema tự thêm cho bài + mẫu khớp điều kiện
    const templates = (s.schema?.templates ?? []).filter((t) => matches(t, p));
    for (const sc of [...custom, ...templates.map((t) => ({ id: t.id, type: t.type, data: t.data }))]) {
      const node = custom_(sc.type, sc.data ?? {}, p, ex, g, orgId, authorId, abs, v);
      if (node) graph.push({ ...node, "@id": node["@id"] ?? `${g.url}#schema-${sc.id}` });
    }

    // Video trong nội dung → VideoObject (khi bật sitemap video), trừ khi đã khai báo tay
    if (s.modules?.videoSitemap && !custom.some((x) => x.type === "VideoObject"))
      for (const [i, vid] of ex.videos.entries())
        graph.push({
          "@type": "VideoObject", "@id": `${g.url}#video-${i + 1}`, name: p.title, description: g.description || p.title,
          thumbnailUrl: vid.kind === "youtube" ? youtubeThumb(vid.src) : abs(vid.poster) ?? (primary ? abs(primary) : undefined),
          uploadDate: p.publishedAt ?? undefined, contentUrl: vid.kind === "file" ? abs(vid.src) : undefined, embedUrl: vid.kind === "youtube" ? youtubeEmbed(vid.src) : vid.kind === "vimeo" ? vid.src : undefined,
          isPartOf: { "@id": `${g.url}#webpage` },
        });
  }
  return clean({ "@context": "https://schema.org", "@graph": graph });
}

const DAYS: Record<string, string> = { mo: "Monday", tu: "Tuesday", we: "Wednesday", th: "Thursday", fr: "Friday", sa: "Saturday", su: "Sunday" };
const dayName = (d: string) => DAYS[d.trim().slice(0, 2).toLowerCase()] ?? d;

function matches(t: SchemaTemplate, p: NonNullable<GraphInput["post"]>) {
  const conds = t.conditions ?? [];
  if (conds.length === 0) return false;
  return conds.some((c) => c.kind === "all" || (c.kind === "postType" && c.value === p.type) || (c.kind === "term" && p.categories.some((x) => x.id === Number(c.value))));
}

function article(type: string, d: Obj, p: NonNullable<GraphInput["post"]>, ex: ReturnType<typeof extract>, g: GraphInput, orgId: string, authorId: string | undefined, abs: (u?: string | null) => string | undefined, v: (t?: string) => string): Obj {
  return {
    "@type": d.articleType || type, "@id": `${g.url}#article`, headline: v(d.headline || "%title%").slice(0, 110), description: v(d.description || "") || g.description,
    datePublished: p.publishedAt ?? undefined, dateModified: p.updatedAt ?? undefined,
    author: authorId ? { "@id": authorId } : undefined, publisher: { "@id": orgId },
    image: p.featuredMedia?.url ? { "@id": `${g.url}#primaryimage` } : undefined,
    mainEntityOfPage: { "@id": `${g.url}#webpage` }, isPartOf: { "@id": `${g.url}#webpage` },
    wordCount: wordCount(ex.text) || undefined, articleSection: p.categories.map((c) => c.name), keywords: p.tags.join(", ") || undefined, inLanguage: g.site.locale,
  };
}

function img(abs: (u?: string | null) => string | undefined, i: any) {
  if (!i) return undefined;
  if (typeof i === "string") return abs(i);
  return i.url ? abs(i.url) : undefined;
}
const num = (x: any) => (x === "" || x == null || isNaN(Number(x)) ? undefined : Number(x));
const rating = (d: Obj) => num(d.ratingValue) && num(d.reviewCount) ? { "@type": "AggregateRating", ratingValue: num(d.ratingValue), reviewCount: num(d.reviewCount), bestRating: 5, worstRating: 1 } : undefined;
const offer = (d: Obj, url?: string) => num(d.price) != null ? {
  "@type": "Offer", price: num(d.price), priceCurrency: d.currency || "VND", availability: d.availability ? `https://schema.org/${d.availability}` : undefined,
  url: d.url || url, validFrom: d.validFrom || undefined, priceValidUntil: d.priceValidUntil || undefined, itemCondition: d.condition ? `https://schema.org/${d.condition}` : undefined,
} : undefined;
const postal = (d: Obj) => d["address.street"] || d["address.locality"] ? {
  "@type": "PostalAddress", streetAddress: d["address.street"], addressLocality: d["address.locality"], addressRegion: d["address.region"],
  postalCode: d["address.postalCode"], addressCountry: d["address.country"],
} : undefined;

function custom_(type: string, d: Obj, p: NonNullable<GraphInput["post"]>, ex: ReturnType<typeof extract>, g: GraphInput, orgId: string, authorId: string | undefined, abs: (u?: string | null) => string | undefined, v: (t?: string) => string): Obj | null {
  const t = (x: any) => (typeof x === "string" ? v(x) : x);
  const page = { "@id": `${g.url}#webpage` };
  switch (type) {
    case "Article": return article(d.articleType || "Article", d, p, ex, g, orgId, authorId, abs, v);
    case "FAQPage": {
      const qs = (d.questions ?? []).filter((q: any) => q?.question && q?.answer);
      return qs.length ? { "@type": "FAQPage", mainEntity: qs.map((q: any) => ({ "@type": "Question", name: t(q.question), acceptedAnswer: { "@type": "Answer", text: t(q.answer) } })), isPartOf: page } : null;
    }
    case "HowTo": return {
      "@type": "HowTo", name: t(d.name), description: t(d.description), totalTime: d.totalTime || undefined, image: img(abs, d.image) ?? img(abs, p.featuredMedia?.url),
      estimatedCost: num(d.estimatedCost) != null ? { "@type": "MonetaryAmount", currency: d.currency || "VND", value: num(d.estimatedCost) } : undefined,
      supply: (d.supplies ?? []).filter(Boolean).map((x: string) => ({ "@type": "HowToSupply", name: x })),
      tool: (d.tools ?? []).filter(Boolean).map((x: string) => ({ "@type": "HowToTool", name: x })),
      step: (d.steps ?? []).filter((s: any) => s?.text).map((s: any, i: number) => ({ "@type": "HowToStep", position: i + 1, name: t(s.name) || undefined, text: t(s.text), image: img(abs, s.image), url: s.url || undefined })),
      isPartOf: page,
    };
    case "Product": return {
      "@type": "Product", name: t(d.name), description: t(d.description), image: img(abs, d.image) ?? img(abs, p.featuredMedia?.url), sku: d.sku, gtin: d.gtin || undefined,
      brand: d.brand ? { "@type": "Brand", name: d.brand } : undefined, offers: offer(d, g.url), aggregateRating: rating(d),
    };
    case "Service": return {
      "@type": "Service", name: t(d.name), description: t(d.description), serviceType: d.serviceType, areaServed: d.areaServed, image: img(abs, d.image),
      provider: { "@id": orgId }, offers: offer(d, g.url), aggregateRating: rating(d),
    };
    case "Event": return {
      "@type": "Event", name: t(d.name), description: t(d.description), image: img(abs, d.image) ?? img(abs, p.featuredMedia?.url), startDate: d.startDate, endDate: d.endDate || undefined,
      eventStatus: d.status ? `https://schema.org/${d.status}` : undefined, eventAttendanceMode: d.attendance ? `https://schema.org/${d.attendance}` : undefined,
      location: d.attendance === "OnlineEventAttendanceMode" ? { "@type": "VirtualLocation", url: d.onlineUrl } : { "@type": "Place", name: d.venue, address: postal(d) },
      organizer: d.organizer ? { "@type": "Organization", name: d.organizer } : { "@id": orgId }, performer: d.performer ? { "@type": "Person", name: d.performer } : undefined,
      offers: offer(d, g.url),
    };
    case "Recipe": return {
      "@type": "Recipe", name: t(d.name), description: t(d.description), image: img(abs, d.image) ?? img(abs, p.featuredMedia?.url), author: authorId ? { "@id": authorId } : undefined,
      datePublished: p.publishedAt ?? undefined, prepTime: d.prepTime || undefined, cookTime: d.cookTime || undefined, totalTime: d.totalTime || undefined,
      recipeYield: d.recipeYield, recipeCategory: d.recipeCategory, recipeCuisine: d.recipeCuisine, keywords: d.keywords,
      nutrition: d.calories ? { "@type": "NutritionInformation", calories: d.calories } : undefined,
      recipeIngredient: (d.ingredients ?? []).filter(Boolean),
      recipeInstructions: (d.instructions ?? []).filter((s: any) => s?.text).map((s: any) => ({ "@type": "HowToStep", name: t(s.name) || undefined, text: t(s.text), image: img(abs, s.image) })),
      aggregateRating: rating(d),
    };
    case "Course": return {
      "@type": "Course", name: t(d.name), description: t(d.description),
      provider: d.provider ? { "@type": "Organization", name: d.provider, sameAs: d.providerUrl || undefined } : { "@id": orgId },
      hasCourseInstance: { "@type": "CourseInstance", courseMode: d.courseMode },
      offers: num(d.price) != null ? { "@type": "Offer", category: num(d.price) === 0 ? "Free" : "Paid", price: num(d.price), priceCurrency: d.currency || "VND" } : undefined,
      aggregateRating: rating(d),
    };
    case "JobPosting": return {
      "@type": "JobPosting", title: t(d.title), description: t(d.description), datePosted: d.datePosted || p.publishedAt?.slice(0, 10), validThrough: d.validThrough || undefined,
      employmentType: d.employmentType,
      hiringOrganization: d.organization ? { "@type": "Organization", name: d.organization, sameAs: d.organizationUrl || undefined, logo: img(abs, d.organizationLogo) } : { "@id": orgId },
      jobLocation: postal(d) ? { "@type": "Place", address: postal(d) } : undefined, jobLocationType: d.remote || undefined,
      applicantLocationRequirements: d.remote ? { "@type": "Country", name: d["address.country"] || "VN" } : undefined,
      baseSalary: num(d.salaryMin) != null ? { "@type": "MonetaryAmount", currency: d.salaryCurrency || "VND", value: { "@type": "QuantitativeValue", minValue: num(d.salaryMin), maxValue: num(d.salaryMax), unitText: d.salaryUnit || "MONTH" } } : undefined,
    };
    case "SoftwareApplication": return {
      "@type": "SoftwareApplication", name: t(d.name), description: t(d.description), operatingSystem: d.operatingSystem, applicationCategory: d.applicationCategory,
      offers: { "@type": "Offer", price: num(d.price) ?? 0, priceCurrency: d.currency || "VND" }, aggregateRating: rating(d),
    };
    case "Book": return {
      "@type": "Book", name: t(d.name), description: t(d.description), author: d.author ? { "@type": "Person", name: d.author } : undefined, image: img(abs, d.image),
      isbn: d.isbn, numberOfPages: num(d.numberOfPages), bookFormat: d.bookFormat ? `https://schema.org/${d.bookFormat}` : undefined,
      publisher: d.publisher ? { "@type": "Organization", name: d.publisher } : undefined, datePublished: d.datePublished || undefined, aggregateRating: rating(d),
    };
    case "VideoObject": return {
      "@type": "VideoObject", name: t(d.name), description: t(d.description), thumbnailUrl: img(abs, d.thumbnailUrl) ?? img(abs, p.featuredMedia?.url),
      uploadDate: d.uploadDate || p.publishedAt || undefined, duration: d.duration || undefined, contentUrl: d.contentUrl || undefined, embedUrl: d.embedUrl ? youtubeEmbed(d.embedUrl) : undefined,
    };
    case "Person": return {
      "@type": "Person", name: t(d.name), jobTitle: d.jobTitle, description: t(d.description), image: img(abs, d.image), email: d.email, telephone: d.telephone,
      worksFor: d.worksFor ? { "@type": "Organization", name: d.worksFor } : undefined, sameAs: (d.sameAs ?? []).filter(Boolean),
    };
    case "LocalBusiness": return {
      "@type": d.businessType || "LocalBusiness", name: t(d.name), description: t(d.description), image: img(abs, d.image), telephone: d.telephone, priceRange: d.priceRange,
      address: postal(d), geo: d.lat && d.lng ? { "@type": "GeoCoordinates", latitude: Number(d.lat), longitude: Number(d.lng) } : undefined,
      openingHoursSpecification: (d.openingHours ?? []).filter((h: any) => h?.days).map((h: any) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: String(h.days).split(",").map(dayName), opens: h.opens, closes: h.closes })),
      aggregateRating: rating(d), url: g.url,
    };
    case "Custom": {
      try {
        const parsed = JSON.parse(d.json ?? "");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed["@type"] ? (({ "@context": _ctx, ...rest }) => rest)(parsed) : null;
      } catch { return null; }
    }
    default: return null;
  }
}
