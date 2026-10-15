import { getPosts, getTerms, Link, type Post, type ShortcodeProps, type Site } from "@cms/theme-sdk";
import { seoSettings } from "./lib/page";
import type { PostSeo } from "./lib/settings";
import { extract, fold } from "./lib/text";
import { words } from "./lib/words";

/** Breadcrumbs ([ecx_breadcrumbs]) — đồng bộ với BreadcrumbList trong JSON-LD. */
export function Breadcrumbs({ crumbs, separator, prefix }: { crumbs: Array<{ name: string; url: string }>; separator: string; prefix?: string }) {
  if (crumbs.length < 2) return null;
  const base = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
  return (
    <nav aria-label="Breadcrumb" className="ecx-breadcrumbs">
      {prefix && <span className="ecx-breadcrumbs-prefix">{prefix} </span>}
      {crumbs.map((c, i) => (
        <span key={i}>
          {i > 0 && <span className="ecx-breadcrumbs-sep" aria-hidden> {separator} </span>}
          {c.url && i < crumbs.length - 1 ? <Link href={base(c.url)}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
        </span>
      ))}
    </nav>
  );
}

/** id của tiêu đề giống cách lõi sinh (chữ không dấu nối bằng "-"). */
const headingId = (text: string) => fold(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Mục lục [ecx_toc levels="2,3" title="Mục lục"]. */
export function Toc({ attrs, post, site }: ShortcodeProps) {
  if (!post?.content) return null;
  const levels = (attrs.levels ?? "2,3").split(",").map((x) => Number(x.trim())).filter((x) => x >= 1 && x <= 6);
  const heads = extract(post.content as any).headings.filter((h) => levels.includes(h.level) && h.text);
  if (heads.length < 2) return null;
  const min = Math.min(...heads.map((h) => h.level));
  return (
    <nav className="ecx-toc" aria-label={attrs.title ?? words(site).toc}>
      <details open={attrs.collapsed !== "true"}>
        <summary className="ecx-toc-title">{attrs.title ?? words(site).toc}</summary>
        <ol>
          {heads.map((h, i) => <li key={i} style={{ marginLeft: `${(h.level - min) * 1.2}em` }}><a href={`#${headingId(h.text)}`}>{h.text}</a></li>)}
        </ol>
      </details>
    </nav>
  );
}

/** Hỏi đáp [ecx_faq] — hiển thị câu hỏi của schema FAQ trong bài (đồng bộ với rich result của Google). */
export function Faq({ attrs, post }: ShortcodeProps) {
  const seo = ((post?.extra as any)?.ecxSeo ?? {}) as PostSeo;
  const faq = (seo.schemas ?? []).find((s) => s.type === "FAQPage");
  const qs = (faq?.data?.questions ?? []).filter((q: any) => q?.question && q?.answer);
  if (!qs.length) return null;
  return (
    <section className="ecx-faq">
      {attrs.title && <h2>{attrs.title}</h2>}
      {qs.map((q: any, i: number) => (
        <details key={i} className="ecx-faq-item" open={i === 0 && attrs.open !== "false"}>
          <summary>{q.question}</summary>
          <div className="ecx-faq-answer">{String(q.answer).split("\n").map((l, j) => <p key={j}>{l}</p>)}</div>
        </details>
      ))}
    </section>
  );
}

/** Thông tin liên hệ [ecx_contact_info show="address,phone,email,hours"] lấy từ Local SEO. */
export function ContactInfo({ attrs, site }: ShortcodeProps) {
  const kg = seoSettings(site)?.knowledgeGraph;
  if (!kg) return null;
  const show = new Set((attrs.show ?? "name,address,phone,email,hours").split(",").map((x) => x.trim()));
  const a = kg.address ?? ({} as any);
  const addr = [a.street, a.locality, a.region, a.postalCode].filter(Boolean).join(", ");
  const w = words(site);
  const DAY = w.days;
  return (
    <address className="ecx-contact" style={{ fontStyle: "normal" }}>
      {show.has("name") && kg.name && <strong>{kg.name}</strong>}
      {show.has("address") && addr && <div>{addr}</div>}
      {show.has("phone") && kg.phone && <div><a href={`tel:${kg.phone.replace(/\s/g, "")}`}>{kg.phone}</a></div>}
      {show.has("email") && kg.email && <div><a href={`mailto:${kg.email}`}>{kg.email}</a></div>}
      {show.has("hours") && kg.openingHours?.length > 0 && (
        <ul className="ecx-hours">{kg.openingHours.map((h, i) => <li key={i}>{h.days.map((d) => DAY[d] ?? d).join(", ")}: {h.opens}–{h.closes}</li>)}</ul>
      )}
      {show.has("map") && kg.geo?.lat && kg.geo?.lng && (
        <iframe title={w.map} loading="lazy" style={{ border: 0, width: "100%", height: 280 }}
          src={`https://www.google.com/maps?q=${encodeURIComponent(`${kg.geo.lat},${kg.geo.lng}`)}&output=embed`} />
      )}
    </address>
  );
}

/** Sitemap HTML [ecx_html_sitemap types="page,post" limit="200"] — trang liệt kê nội dung cho người đọc. */
export async function HtmlSitemap({ attrs, site }: ShortcodeProps) {
  const types = (attrs.types ?? "page,post").split(",").map((x) => x.trim()).filter(Boolean);
  const limit = Math.min(500, Number(attrs.limit) || 200);
  const groups = await Promise.all(types.map(async (type) => ({ type, items: (await getPosts({ type, perPage: limit, orderBy: type === "page" ? "title" : "date", order: type === "page" ? "asc" : "desc" }).catch(() => ({ items: [] as Post[] }))).items })));
  const cats = attrs.categories === "false" ? [] : await getTerms("category").catch(() => []);
  const visible = (p: Post) => !((p.extra as any)?.ecxSeo as PostSeo | undefined)?.robots?.noindex;
  const w = words(site);
  const label: Record<string, string> = { page: w.pages, post: w.posts, category: w.categories };
  return (
    <div className="ecx-html-sitemap">
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.type}><h2>{label[g.type] ?? g.type}</h2><ul>{g.items.filter(visible).map((p) => <li key={p.id}><Link href={p.link}>{p.title}</Link></li>)}</ul></section>
      ))}
      {cats.length > 0 && <section><h2>{label.category}</h2><ul>{cats.map((c) => <li key={c.id}><Link href={c.link}>{c.name}</Link> ({c.count})</li>)}</ul></section>}
    </div>
  );
}

export type { Site };
