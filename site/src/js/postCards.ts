// Shared blog-post → card/link mapping for the /blog/ listing, the home Latest Posts grid, and the
// detail page's prev/next + related sections, so they can't drift. Pure data-shaping — the runtime
// module the Astro files import; its check lives beside it (postCards.test.ts).
//
// All imports below are type-only, so `pnpm test` (Node type-stripping) erases them and this file
// runs with no bundler / no astro: virtual-module resolution. Keep them type-only.
import type { ContentCardProps } from "@components/Cards/ContentCard.astro";
import type { BadgeVariant } from "@components/ui/badge";
import type { CollectionEntry } from "astro:content";

export interface CategoryMeta {
  /** bracketed retro label, e.g. "[Quest]" (the ui/badge pixel variant uppercases it). */
  label: string;
  variant: BadgeVariant;
  /** colour override for tones with no semantic token (Lore = fixed maroon). */
  class?: string;
}

/** category (lower-cased) → tone. LORE has no semantic token, so it takes a fixed maroon `class`. */
const CATEGORY_TONES: Record<string, Pick<CategoryMeta, "variant" | "class">> = {
  quest: { variant: "success" },
  tech: { variant: "primary" },
  guide: { variant: "warning" },
  lore: { variant: "secondary", class: "bg-secondary-600 text-secondary-100" },
  "dev log": { variant: "info" },
};

/**
 * A post's `category` → its retro badge: bracketed label + a ui/badge tone. The Figma "[QUEST]" /
 * "[LORE]" / "[TECH]" / "[GUIDE]" tags. Unknown categories fall back to blue.
 *
 * @param category the entry's `category` field (case-insensitive match)
 * @returns the badge label, tone variant, and optional colour override
 */
export function categoryMeta(category: string): CategoryMeta {
  const tone = CATEGORY_TONES[category.trim().toLowerCase()] ?? { variant: "primary" };
  return { label: `[${category}]`, ...tone };
}

/**
 * Map a `blog` entry to the shared ContentCard props used by every post grid.
 *
 * @param entry a `blog` collection entry
 * @returns props ready to spread into `<ContentCard />`
 * @example toPostCard(entry).href; // "/blog/history-of-the-floppy-disk/"
 */
export function toPostCard(entry: CollectionEntry<"blog">): ContentCardProps {
  const { data } = entry;
  const { label, variant, class: badgeClass } = categoryMeta(data.category);
  return {
    href: `/blog/${entry.id}/`,
    image: data.heroImage,
    imageAlt: data.heroImageAlt,
    badgeLabel: label,
    badgeVariant: variant,
    badgeClass,
    title: data.title,
    description: data.description,
    cta: "Read",
  };
}

export interface AdjacentLink {
  href: string;
  title: string;
}

/**
 * Prev (newer) / next (older) neighbours of a post in the date-sorted list — the Figma "◄PREV NEXT►"
 * footer nav. Undefined at the ends so the caller can omit the missing side.
 *
 * @param sorted posts newest-first (see blogData.getSortedPosts)
 * @param id the current entry id
 */
export function getAdjacentPosts(
  sorted: readonly CollectionEntry<"blog">[],
  id: string,
): { prev?: AdjacentLink; next?: AdjacentLink } {
  const i = sorted.findIndex((e) => e.id === id);
  if (i === -1) return {};
  const link = (e?: CollectionEntry<"blog">): AdjacentLink | undefined =>
    e ? { href: `/blog/${e.id}/`, title: e.data.title } : undefined;
  return { prev: link(sorted[i - 1]), next: link(sorted[i + 1]) };
}

/**
 * Up to `limit` "More Quests" related posts — same category first, then most-recent, excluding the
 * current post. Keeps the section fully dynamic (every link resolves), rather than transcribing the
 * mock's two fixed placeholder titles.
 *
 * @param sorted posts newest-first
 * @param id the current entry id
 * @param limit max related posts (default 2, the mock count)
 */
export function getRelatedPosts(
  sorted: readonly CollectionEntry<"blog">[],
  id: string,
  limit = 2,
): CollectionEntry<"blog">[] {
  const others = sorted.filter((e) => e.id !== id);
  const current = sorted.find((e) => e.id === id);
  if (!current) return others.slice(0, limit);
  const key = current.data.category.toLowerCase();
  const sameCat = others.filter((e) => e.data.category.toLowerCase() === key);
  const rest = others.filter((e) => e.data.category.toLowerCase() !== key);
  return [...sameCat, ...rest].slice(0, limit);
}
