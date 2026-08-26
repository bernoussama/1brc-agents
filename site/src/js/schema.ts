/**
 * JSON-LD structured-data builders (schema.org) — dependency-free.
 *
 * The template emits structured data with native `<script type="application/ld+json">`
 * tags, the same "owned, not vendored" stance as the meta/OG tags in BaseHead (no SEO
 * dependency). Each builder returns a plain JSON-LD node; `getSiteSchema` composes the
 * site-level graph (Organization + WebSite) that `BaseHead` emits on every page, and merges
 * any page-specific nodes (Article, BreadcrumbList) into one `@graph`. Serialize with
 * `serializeJsonLd`, which escapes `<` as `\u003c`, so the JSON is safe to inline in a `<script>`
 * without a `</script>` breakout.
 *
 * SEO is owned, not vendored — see AGENTS.md.
 */

/**
 * A single JSON-LD node. schema.org is open-ended, so we type each builder's *inputs*
 * precisely and keep the node shape loose. `@id` lets nodes cross-reference inside a `@graph`.
 */
export type JsonLdNode = Record<string, unknown> & {
  "@type": string | readonly string[];
  "@id"?: string;
};

/** OG `article:*` metadata for an article page (drives `og:type=article`). */
export interface ArticleMeta {
  published: Date;
  modified?: Date;
  author?: string;
}

/**
 * The SEO extension props a page threads through BaseLayout to BaseHead: a slot for
 * page-specific JSON-LD nodes plus optional article metadata. Shared so the two layouts
 * can't drift.
 */
export interface SeoProps {
  /**
   * page-specific JSON-LD nodes, merged into the site graph (Organization + WebSite).
   *
   * Always an array, never `Node | Node[]`: a union here buys a call site one saved pair of
   * brackets and costs BaseHead a normalizing ternary on every render.
   */
  schema?: JsonLdNode[];
  /** present on article pages — drives og:type=article + the article:* meta */
  article?: ArticleMeta;
}

/** Stable `@id` for the site Organization node, derived from any absolute site URL. */
export function organizationId(siteUrl: string): string {
  return `${new URL(siteUrl).origin}/#organization`;
}

export interface OrganizationInput {
  name: string;
  /** any absolute URL on the site — only its origin is used */
  url: string;
  /** absolute URL of the brand logo */
  logo: string;
  /** social / profile URLs that identify the same entity */
  sameAs?: readonly string[];
}

/**
 * * Organization node — the publishing entity behind the site.
 * @returns a JSON-LD Organization keyed by a stable `@id` so WebSite/Article can reference it.
 *
 * ```ts
 * getOrganizationSchema({ name: "Acme", url: "https://acme.com/", logo: "https://acme.com/logo.png" });
 * ```
 */
export function getOrganizationSchema({ name, url, logo, sameAs }: OrganizationInput): JsonLdNode {
  const origin = new URL(url).origin;
  return {
    "@type": "Organization",
    "@id": organizationId(url),
    name,
    url: `${origin}/`,
    logo: { "@type": "ImageObject", url: logo },
    ...(sameAs && sameAs.length > 0 ? { sameAs: [...sameAs] } : {}),
  };
}

export interface WebSiteInput {
  name: string;
  /** any absolute URL on the site — only its origin is used */
  url: string;
  description?: string;
  /** BCP-47 language tag, e.g. "en-US" */
  inLanguage: string;
  /** `@id` of the publisher Organization (from `organizationId`) */
  publisherId?: string;
}

/**
 * * WebSite node — the site itself, linked to its publisher Organization.
 * @returns a JSON-LD WebSite keyed by a stable `@id`.
 */
export function getWebSiteSchema({
  name,
  url,
  description,
  inLanguage,
  publisherId,
}: WebSiteInput): JsonLdNode {
  const origin = new URL(url).origin;
  return {
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name,
    url: `${origin}/`,
    inLanguage,
    ...(description ? { description } : {}),
    ...(publisherId ? { publisher: { "@id": publisherId } } : {}),
  };
}

export interface SiteSchemaInput {
  name: string;
  /** any absolute URL on the site — only its origin is used */
  url: string;
  description?: string;
  /** BCP-47 language tag, e.g. "en-US" */
  inLanguage: string;
  /** absolute URL of the brand logo */
  logo: string;
  /** social / profile URLs for the Organization `sameAs` */
  sameAs?: readonly string[];
}

/**
 * * The site-level graph every page emits: an Organization and the WebSite it publishes,
 * linked by `@id`. Composes {@link getOrganizationSchema} + {@link getWebSiteSchema} so the
 * publisher wiring lives here, not in the layout.
 * @returns the two linked nodes, ready to spread into a page's graph.
 */
export function getSiteSchema({
  name,
  url,
  description,
  inLanguage,
  logo,
  sameAs,
}: SiteSchemaInput): JsonLdNode[] {
  return [
    getOrganizationSchema({ name, url, logo, sameAs }),
    getWebSiteSchema({ name, url, description, inLanguage, publisherId: organizationId(url) }),
  ];
}

export interface ArticleInput {
  headline: string;
  description: string;
  /** canonical absolute URL of the article (also used as `mainEntityOfPage`) */
  url: string;
  /** absolute image URL */
  image?: string;
  /** ISO-8601 publish date, e.g. `date.toISOString()` */
  datePublished: string;
  /** ISO-8601 modified date; omitted from the node when absent (never invented from datePublished) */
  dateModified?: string;
  authorName: string;
  authorUrl?: string;
  /** BCP-47 language tag, e.g. "en-US" */
  inLanguage: string;
  /** `@id` of the publisher Organization (from `organizationId`) */
  publisherId?: string;
}

/**
 * * BlogPosting node (a schema.org Article subtype) for a blog post.
 * @returns a JSON-LD BlogPosting. Pass it to a page's `schema` prop alongside a
 *          breadcrumb built with {@link getBreadcrumbSchema}.
 */
export function getArticleSchema({
  headline,
  description,
  url,
  image,
  datePublished,
  dateModified,
  authorName,
  authorUrl,
  inLanguage,
  publisherId,
}: ArticleInput): JsonLdNode {
  return {
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline,
    description,
    url,
    mainEntityOfPage: url,
    inLanguage,
    datePublished,
    // only emit dateModified when the content was actually updated — never invent it from datePublished
    ...(dateModified ? { dateModified } : {}),
    author: {
      "@type": "Person",
      name: authorName,
      ...(authorUrl ? { url: authorUrl } : {}),
    },
    ...(image ? { image: { "@type": "ImageObject", url: image } } : {}),
    ...(publisherId ? { publisher: { "@id": publisherId } } : {}),
  };
}

export interface BreadcrumbItem {
  name: string;
  /** absolute URL of the crumb's page */
  url: string;
}

/**
 * * BreadcrumbList node from an ordered trail (root → current page).
 * @returns a JSON-LD BreadcrumbList with 1-indexed positions. Pair it with a visible
 *          breadcrumb nav so the markup and the schema agree.
 */
export function getBreadcrumbSchema(items: readonly BreadcrumbItem[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * * Serialize nodes into a schema.org document for inlining in a `<script>` tag.
 * A single node inlines directly; multiple nodes are wrapped in an `@graph`. `<` is escaped to
 * `\u003c` so a value containing `</script>` cannot break out of the tag.
 * @returns the JSON string, or `""` for an empty graph (so BaseHead can skip the tag).
 */
export function serializeJsonLd(nodes: readonly JsonLdNode[]): string {
  if (nodes.length === 0) return "";
  const doc =
    nodes.length === 1
      ? { "@context": "https://schema.org", ...nodes[0] }
      : { "@context": "https://schema.org", "@graph": [...nodes] };
  return JSON.stringify(doc).replace(/</g, "\\u003c");
}
