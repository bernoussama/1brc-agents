// Self-check for projectCards.ts — the status→badge map and the entry→card mapping (house rule:
// non-trivial logic leaves ONE runnable check behind — see AGENTS.md). No framework:
// `pnpm test` runs this under Node's type-stripping.
import assert from "node:assert/strict";

import type { CollectionEntry } from "astro:content";

import { statusMeta, toProjectCard } from "./projectCards.ts";

// statusMeta: both branches, exhaustively.
assert.deepEqual(statusMeta("complete"), { label: "[Complete]", variant: "success" });
assert.deepEqual(statusMeta("in-progress"), { label: "[In Progress]", variant: "warning" });

// toProjectCard: a minimal stub entry (only the fields the mapper reads). The cast is compile-time
// only — Node strips it, leaving a plain object at runtime.
const stub = {
  id: "realtime-chat",
  data: {
    title: "Real-Time Chat Application",
    cardTitle: "Building a Real-Time Chat App",
    description: "Implemented WebSockets and Redis pub/sub.",
    status: "complete",
    thumbnail: { src: "/thumb.png", width: 2, height: 1 },
    thumbnailAlt: "A pixel-art chat interface",
    tech: ["React", "Node.js"],
  },
} as unknown as CollectionEntry<"projects">;

const card = toProjectCard(stub);
assert.equal(
  card.href,
  "/projects/realtime-chat/",
  "href builds from the entry id + trailing slash",
);
assert.equal(card.title, "Building a Real-Time Chat App", "cardTitle wins over title when present");
assert.equal(card.badgeLabel, "[Complete]");
assert.equal(card.badgeVariant, "success");
assert.equal(card.cta, "View");
assert.deepEqual(card.tags, ["React", "Node.js"]);

// cardTitle absent → falls back to the canonical title.
const noCardTitle = {
  id: "database-index-optimization",
  data: {
    title: "Database Index Optimization",
    description: "Rebuilding indexes.",
    status: "in-progress",
    thumbnail: { src: "/t.png", width: 2, height: 1 },
    thumbnailAlt: "alt",
    tech: [],
  },
} as unknown as CollectionEntry<"projects">;

const card2 = toProjectCard(noCardTitle);
assert.equal(
  card2.title,
  "Database Index Optimization",
  "falls back to title when cardTitle is omitted",
);
assert.equal(card2.badgeLabel, "[In Progress]");
assert.equal(card2.badgeVariant, "warning");

console.log("projectCards.test.ts — all assertions passed");
