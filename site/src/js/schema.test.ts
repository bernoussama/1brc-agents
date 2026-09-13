/**
 * Runnable self-check for the JSON-LD builders in ./schema.ts — no test framework.
 * Run:  `pnpm test` (which discovers every src/**\/*.test.ts), or directly
 *       `node --experimental-strip-types src/js/schema.test.ts`.
 * Exits non-zero (throws) if any invariant breaks; prints "schema.test: ok" otherwise.
 */
import {
  getArticleSchema,
  getBreadcrumbSchema,
  getOrganizationSchema,
  getSiteSchema,
  getWebSiteSchema,
  organizationId,
  serializeJsonLd,
} from "./schema.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`schema.test FAILED: ${msg}`);
}

// @id is stable and origin-only (path in the input URL is dropped).
const org = getOrganizationSchema({
  name: "Acme",
  url: "https://acme.com/some/deep/path/",
  logo: "https://acme.com/logo.png",
  sameAs: ["https://x.com/acme"],
});
assert(org["@id"] === "https://acme.com/#organization", "org @id should be origin-only");
assert(org.url === "https://acme.com/", "org url should be the origin root");
assert(Array.isArray(org.sameAs), "sameAs should pass through when non-empty");

// Empty sameAs is omitted entirely (no empty array in output).
const orgNoSocial = getOrganizationSchema({
  name: "A",
  url: "https://a.com/",
  logo: "x",
  sameAs: [],
});
assert(!("sameAs" in orgNoSocial), "empty sameAs should be omitted");

// WebSite references the Organization by the same id helper.
const site = getWebSiteSchema({
  name: "Acme",
  url: "https://acme.com/",
  inLanguage: "en-US",
  publisherId: organizationId("https://acme.com/"),
});
assert(
  (site.publisher as { "@id": string })["@id"] === org["@id"],
  "website publisher must reference the org @id",
);

// Breadcrumb positions are 1-indexed and increment in order.
const crumbs = getBreadcrumbSchema([
  { name: "Home", url: "https://acme.com/" },
  { name: "Blog", url: "https://acme.com/blog/" },
]);
const items = crumbs.itemListElement as Array<{ position: number; name: string }>;
assert(items[0].position === 1 && items[1].position === 2, "breadcrumb positions must be 1,2");
assert(items[1].name === "Blog", "breadcrumb order must be preserved");

// serializeJsonLd escapes `<` so a `</script>` in data can't break out of the tag.
const escaped = serializeJsonLd([{ "@type": "Thing", name: "</script><script>alert(1)" }]);
assert(!escaped.includes("</script>"), "raw </script> must not survive serialization");
assert(escaped.includes("\\u003c/script>"), "< must be escaped to \\u003c");

// Single node inlines directly; multiple nodes are wrapped in @graph.
assert(escaped.includes('"@context"') && !escaped.includes("@graph"), "single node: no @graph");
const graph = serializeJsonLd([org, site]);
assert(graph.includes('"@graph"'), "multiple nodes: must use @graph");

// Empty input yields "" so the caller can skip emitting a tag.
assert(serializeJsonLd([]) === "", "empty graph should serialize to an empty string");

// getSiteSchema composes org + website and links website → org by @id (the layout no longer wires this).
const [siteOrg, siteWeb] = getSiteSchema({
  name: "Acme",
  url: "https://acme.com/",
  inLanguage: "en-US",
  logo: "https://acme.com/logo.png",
});
assert(
  (siteWeb.publisher as { "@id": string })["@id"] === siteOrg["@id"],
  "getSiteSchema must link website → org",
);

// getArticleSchema: stable @id; dateModified is OMITTED when absent (never invented); url doubles
// as mainEntityOfPage.
const post = getArticleSchema({
  headline: "T",
  description: "D",
  url: "https://acme.com/blog/p/",
  datePublished: "2026-01-01",
  authorName: "A",
  inLanguage: "en-US",
});
assert(post["@id"] === "https://acme.com/blog/p/#article", "article must carry a stable @id");
assert(
  !("dateModified" in post),
  "dateModified must be omitted when not provided (never invented)",
);
assert(post.mainEntityOfPage === "https://acme.com/blog/p/", "mainEntityOfPage should equal url");
assert(!("publisher" in post), "publisher omitted when no publisherId is passed");

// dateModified, authorUrl, and publisher reference all thread through when provided.
const updated = getArticleSchema({
  headline: "T",
  description: "D",
  url: "https://acme.com/blog/p/",
  datePublished: "2026-01-01",
  dateModified: "2026-02-01",
  authorName: "A",
  authorUrl: "https://acme.com/about/",
  inLanguage: "en-US",
  publisherId: organizationId("https://acme.com/"),
});
assert(updated.dateModified === "2026-02-01", "dateModified passes through when provided");
assert(
  (updated.author as { url?: string }).url === "https://acme.com/about/",
  "author url threads through",
);
assert(
  (updated.publisher as { "@id": string })["@id"] === "https://acme.com/#organization",
  "publisher references the org @id",
);

console.log("schema.test: ok");
