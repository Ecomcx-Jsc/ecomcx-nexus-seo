// Kiểu cài đặt của Ecomcx SEO (dùng chung cho phần website và admin). Giá trị mặc định đầy đủ nằm ở backend (Settings.cs).

export type Robots = { noindex?: boolean; nofollow?: boolean; noarchive?: boolean; nosnippet?: boolean; noimageindex?: boolean };
export type AdvancedRobots = { maxSnippet?: number; maxImagePreview?: "none" | "standard" | "large"; maxVideoPreview?: number };
export type ImageRef = { id?: number; url: string; width?: number; height?: number; alt?: string } | null;

export interface TypeSettings {
  title?: string; description?: string; noindex?: boolean; robots?: Robots | null;
  /** Schema mặc định của loại bài: Article | BlogPosting | NewsArticle | WebPage | none. */
  schemaType?: string;
  /** Ẩn hộp SEO trong trình soạn của loại này. */
  hideMetaBox?: boolean;
}

export interface SchemaTemplate {
  id: string; name: string; type: string; data: Record<string, any>;
  /** Điều kiện áp dụng: loại bài, chuyên mục (id), hoặc mọi bài. */
  conditions: Array<{ kind: "all" | "postType" | "term"; value?: string | number }>;
}

export interface SeoSettings {
  modules: Record<string, boolean>;
  general: {
    separator: string; capitalizeTitles: boolean;
    noindexEmptyTerms: boolean; noindexPaginated: boolean; noindexSearch: boolean; noindexPasswordProtected: boolean; noindexArchiveSubpages: boolean;
    robots: Robots; advancedRobots: AdvancedRobots;
    nofollowExternal: boolean; nofollowImageLinks: boolean; externalNewTab: boolean; nofollowExcludeDomains: string[]; nofollowDomains: string[];
  };
  titles: {
    home: { title: string; description: string; ogTitle: string; ogDescription: string; ogImage: ImageRef; robots: Robots | null };
    postTypes: Record<string, TypeSettings>;
    taxonomies: Record<string, TypeSettings>;
    author: TypeSettings & { disabled?: boolean };
    date: TypeSettings & { disabled?: boolean };
    search: { title: string };
    notFound: { title: string };
  };
  social: {
    facebookUrl: string; twitterUsername: string; profiles: string[]; ogImage: ImageRef;
    facebookAppId: string; facebookAdminId: string; twitterCard: "summary" | "summary_large_image"; slackEnhanced: boolean;
  };
  knowledgeGraph: {
    type: "organization" | "person"; name: string; alternateName: string; logo: ImageRef; url: string; description: string; email: string; phone: string;
    businessType: string; address: { street: string; locality: string; region: string; postalCode: string; country: string };
    geo: { lat: string; lng: string }; openingHours: Array<{ days: string[]; opens: string; closes: string }>; priceRange: string; foundingDate: string;
  };
  webmaster: { google: string; bing: string; baidu: string; yandex: string; pinterest: string; norton: string; custom: string };
  analytics: { ga4: string; gtm: string; serviceAccount?: string; searchConsoleProperty?: string };
  sitemap: {
    includeImages: boolean; excludePosts: number[]; excludeTerms: number[]; postTypes: Record<string, boolean>; taxonomies: Record<string, boolean>;
    news: { postTypes: string[]; publicationName: string; excludeTerms: number[] };
    video: { postTypes: string[] };
  };
  breadcrumbs: {
    separator: string; showHome: boolean; homeLabel: string; prefix: string; archiveFormat: string; searchFormat: string;
    notFoundLabel: string; showAncestors: boolean; hideTaxonomyName: boolean; showPostTitle: boolean;
  };
  imageSeo: { addMissingAlt: boolean; altFormat: string; addMissingTitle: boolean; titleFormat: string; onUpload: boolean; caseChange: string };
  robotsTxt: { custom: boolean; content: string };
  llmsTxt: { postTypes: string[]; limit: number; extra: string };
  indexNow: { key: string; postTypes: string[]; autoSubmit: boolean };
  schema: { templates: SchemaTemplate[] };
  redirections?: { autoOnSlugChange: boolean; defaultType: number; keepQuery: boolean };
  monitor404?: { mode: "simple" | "advanced"; limit: number; ignore: string[]; ignoreQuery: boolean };
}

/** SEO riêng của một bài/trang (post.meta._ecx_seo). */
export interface PostSeo {
  title?: string; description?: string; focusKeywords?: string[]; score?: number;
  canonical?: string; robots?: Robots | null; advancedRobots?: AdvancedRobots | null;
  og?: { title?: string; description?: string; image?: ImageRef };
  twitter?: { useOg?: boolean; title?: string; description?: string; image?: ImageRef; card?: "summary" | "summary_large_image" };
  schemas?: Array<{ id: string; type: string; data: Record<string, any> }> | null;
  /** Bỏ schema mặc định của loại bài (chỉ dùng schemas tự thêm). */
  disableDefaultSchema?: boolean;
  breadcrumbTitle?: string; pillar?: boolean;
  /** Chuyên mục chính: { category: 12 }. */
  primaryTerm?: Record<string, number>;
  links?: { internal: number; external: number };
}

export const META_KEY = "_ecx_seo";

/** Mẫu mặc định khi loại bài/phân loại chưa được cấu hình. */
export const DEFAULT_POST_TYPE: TypeSettings = { title: "%title% %sep% %sitename%", description: "%excerpt%", schemaType: "Article" };
export const DEFAULT_PAGE: TypeSettings = { title: "%title% %sep% %sitename%", description: "%excerpt%", schemaType: "WebPage" };
export const DEFAULT_TAXONOMY: TypeSettings = { title: "%term% %sep% %sitename%", description: "%term_description%" };

export function postTypeSettings(s: SeoSettings | undefined, type: string): TypeSettings {
  const base = type === "page" ? DEFAULT_PAGE : DEFAULT_POST_TYPE;
  return { ...base, ...(s?.titles?.postTypes?.[type] ?? {}) };
}
export function taxonomySettings(s: SeoSettings | undefined, taxonomy: string): TypeSettings {
  return { ...DEFAULT_TAXONOMY, ...(s?.titles?.taxonomies?.[taxonomy] ?? {}) };
}

export const on = (s: SeoSettings | undefined, module: string, fallback = true) => s?.modules?.[module] ?? fallback;
