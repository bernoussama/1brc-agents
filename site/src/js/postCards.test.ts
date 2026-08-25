// Self-check for postCards.ts — the category→badge map, the entry→card mapping, and the prev/next
// + related selectors (house rule: non-trivial logic leaves ONE runnable check behind — see
// AGENTS.md). No framework: `pnpm test` runs this under Node's type-stripping.
import assert from "node:assert/strict";

import type { CollectionEntry } from "astro:content";

import { categoryMeta, getAdjacentPosts, getRelatedPosts, toPostCard } from "./postCards.ts";

// categoryMeta: known tones + the maroon override + the unknown fallback.
assert.deepEqual(categoryMeta("Quest"), { label: "[Quest]", variant: "success" });
assert.deepEqual(categoryMeta("tech"), { label: "[tech]", variant: "primary" });
assert.deepEqual(categoryMeta("Guide"), { label: "[Guide]", variant: "warning" });
assert.equal(categoryMeta("Lore").variant, "secondary");
assert.equal(categoryMeta("Lore").class, "bg-secondary-600 text-secondary-100");
assert.equal(categoryMeta("Dev Log").variant, "info");
assert.deepEqual(categoryMeta("Unmapped"), { label: "[Unmapped]", variant: "primary" });

// Minimal stub entries (only the fields the mappers read). The casts are compile-time only.
const mk = (id: string, category: string): CollectionEntry<"blog"> =>
  ({
    id,
    data: {
      title: id.replace(/-/g, " "),
      description: `about ${id}`,
      category,
      heroImage: { src: `/${id}.jpg`, width: 2, height: 1 },
      heroImageAlt: `${id} art`,
    },
  }) as unknown as CollectionEntry<"blog">;

const posts = [mk("a", "Tech"), mk("b", "Lore"), mk("c", "Tech"), mk("d", "Guide")];

// toPostCard: href from id, category → badge, CTA.
const card = toPostCard(posts[1]);
assert.equal(card.href, "/blog/b/", "href builds from the entry id + trailing slash");
assert.equal(card.badgeLabel, "[Lore]");
assert.equal(card.badgeVariant, "secondary");
assert.equal(card.badgeClass, "bg-secondary-600 text-secondary-100");
assert.equal(card.cta, "Read");

// getAdjacentPosts: middle has both, ends omit the missing side.
assert.deepEqual(getAdjacentPosts(posts, "b"), {
  prev: { href: "/blog/a/", title: "a" },
  next: { href: "/blog/c/", title: "c" },
});
assert.equal(getAdjacentPosts(posts, "a").prev, undefined, "first post has no prev");
assert.equal(getAdjacentPosts(posts, "d").next, undefined, "last post has no next");
assert.deepEqual(getAdjacentPosts(posts, "missing"), {}, "unknown id yields no neighbours");

// getRelatedPosts: same category first, excludes self, respects the limit.
const related = getRelatedPosts(posts, "a", 2);
assert.equal(related.length, 2);
assert.equal(related[0].id, "c", "same-category post ranks first");
assert.ok(!related.some((e) => e.id === "a"), "the current post is never related to itself");

console.log("postCards.test.ts — all assertions passed");
