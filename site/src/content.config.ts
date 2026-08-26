import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { defineCollection, reference } from "astro:content";

/**
 * Blog — the "Latest Posts" listing (Figma node 76:4) + per-post article pages (node 5:128).
 * Entries live at src/data/blog/<slug>/index.mdx (entry id => "<slug>").
 *
 * Unlike `projects` (whose detail is fixed slots), the blog article body is genuine free-form prose
 * — headings, lists, blockquotes, code — so it IS the MDX body (rendered via `render()` → `<Content />`,
 * styled by the `.blog-prose` class). Frontmatter carries only what the layout lays out in slots:
 * the byline (`authors`), the retro `category` tag (drives the card + article badge tone via
 * postCards.categoryMeta), the footer `tags`, and the hero image. `pubDate` sorts the listing.
 */
const blogCollection = defineCollection({
  loader: glob({ pattern: "**/[^_]*{md,mdx}", base: "./src/data/blog" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(), // card title + article H1 + SEO title
      description: z.string(), // card excerpt + SEO meta description
      // byline (avatar + name); referenced ids must exist, and every post needs at least one
      authors: z.array(reference("authors")).min(1, "a post needs at least one author reference"),
      // coerce.date validates: it runs `new Date(value)` then rejects an Invalid Date at build time
      pubDate: z.coerce.date(), // sorts the listing + article:published_time
      updatedDate: z.coerce.date().optional(), // drives article:modified_time only when present
      // required, not optional: it is both the card thumbnail AND the article hero banner, and a
      // post without one degrades the listing and the OG image at once
      heroImage: image(),
      heroImageAlt: z.string(),
      // the retro category tag ("Quest" / "Lore" / "Tech" / "Guide" / "Dev Log") — see categoryMeta
      category: z.string(),
      tags: z.array(z.string()).default([]), // footer hashtags (#pixel, #gamedev)
      draft: z.boolean().optional(),
    }),
});

/**
 * Projects — the "Project Log" (Figma node 72:7) + per-project detail pages (node 72:191).
 * Entries live at src/data/projects/<slug>/index.mdx (entry id => "<slug>").
 *
 * The free-form "Project Overview" prose is the MDX BODY (rendered via `render()`); everything the
 * detail page lays out in fixed slots — the spec table, the feature list, the challenge/solution
 * pair — is structured frontmatter so it can be validated and rendered without parsing prose.
 * `status` drives the retro card badge; `order` sorts the listing (see @components/Sections/Project).
 */
const projectsCollection = defineCollection({
  loader: glob({ pattern: "**/[^_]*{md,mdx}", base: "./src/data/projects" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(), // detail H1 + SEO title + fallback card title
      cardTitle: z.string().optional(), // listing card title (the mock's differs from the H1)
      description: z.string(), // listing card excerpt + SEO meta description
      tagline: z.string(), // detail hero intro line
      status: z.enum(["complete", "in-progress"]),
      moduleId: z.string(), // shown on the detail hero, e.g. "#01_CHAT"
      order: z.number(), // listing sort key (ascending)
      thumbnail: image(),
      thumbnailAlt: z.string(),
      tech: z.array(z.string()), // flat tag pills on the card
      specs: z.array(z.object({ label: z.string(), value: z.string() })), // SYS_SPECS rows
      features: z.array(z.object({ lead: z.string(), text: z.string() })), // SYSTEM FEATURES list
      archCaption: z.string(), // ARC_MAP caption, e.g. "[Packet Switching Engine]"
      challenge: z.object({ title: z.string(), body: z.string() }),
      solution: z.object({ title: z.string(), body: z.string() }),
      draft: z.boolean().optional(),
    }),
});

const authorsCollection = defineCollection({
  loader: glob({ pattern: "**/[^_]*{md,mdx}", base: "./src/data/authors" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      avatar: image().optional(),
      authorLink: z.string(), // author's public URL — becomes the JSON-LD Article author.url
    }),
});

export const collections = {
  blog: blogCollection,
  authors: authorsCollection,
  projects: projectsCollection,
};
