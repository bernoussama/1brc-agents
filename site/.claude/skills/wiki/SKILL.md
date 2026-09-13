---
name: wiki
description: Build and maintain the codebase wiki under wiki/ — a Claude-owned, interlinked markdown knowledge base that captures the non-derivable architecture, subsystems, and cross-cutting patterns of this repo so an LLM (and a human) can understand it fast. Use when asked to document the codebase, update/refresh/sync the wiki, ask the wiki a question, or lint it. Operations: sync, ask, lint, ingest.
---

# Wiki maintainer — schema & operations

This repo carries a `wiki/` knowledge base that **you own and write entirely**. Its goal: let an
LLM understand this codebase as close to 100% as possible, while doubling as the template's human
docs. It captures what no single file makes obvious — the architecture, how subsystems connect,
and the _why_ behind decisions — not a re-typing of the code.

**Why a compiled wiki and not RAG:** this repo is small enough that the large-context model can
read all of it directly. The wiki's value is the _durable synthesis_ (cross-file relationships,
rationale, contradictions) compiled once and kept current — no embeddings/vector DB needed. If the
wiki ever outgrows a flat `index.md` (hundreds of pages), add a local markdown search then, not before.

## The layers

This wiki is an instantiation of the **LLM Wiki pattern** (`wiki/sources/llm-wiki-pattern.md`) — a
compounding, interlinked knowledge base the LLM maintains, _not_ RAG re-derived per query. Its three
layers, adapted for a codebase:

- **Sources** (the source of truth). Two kinds: (1) **the live codebase** — read fresh from the repo,
  never a frozen copy, and re-grounded against the current files on each `sync` because code drifts;
  (2) **external references** (a finished starter, an upstream doc, a design note) — summarized into
  `wiki/sources/` via `ingest` and read by hand, never imported.
- **`wiki/`** is the LLM-owned knowledge base: interlinked markdown you create and maintain.
- **This skill** is the schema: structure, conventions, and the operations below. Co-evolve it with
  the human as the template grows.

```
wiki/
├── index.md          # catalog — the map of the wiki (keep current). First read on any query.
├── overview.md       # the evolving architecture synthesis / how it all fits
├── log.md            # append-only, grep-able history: ## [date] op | title
├── subsystems/       # the concrete moving parts: i18n, content, keystatic, styling, layouts, scripts
├── concepts/         # cross-cutting patterns/ideas that span subsystems (config-driven, the ethos)
├── ideal-template/   # the target standard to grow into: architecture, naming-conventions, code-quality
└── sources/          # summaries of EXTERNAL references ingested (galaxy-main, the wiki pattern itself)
```

`ideal-template/` pages are `type: standard` — they describe the _target_ conventions (distilled from
the reference starter, deploy-neutral) rather than current state, marking ✓-present vs →-target so they
never read as inventing files. Update them via `ingest` when the reference standard is revisited.

Add a top-level category (`decisions/`, `flows/`, `gotchas/`, …) when a kind of page recurs — create
the dir, note it here and in `index.md`. Don't pre-create empties (YAGNI).

## Page conventions

Every page opens with YAML frontmatter (kept current on edit), so it's queryable in Obsidian/Dataview:

```markdown
---
title: <Human Readable Title>
type: subsystem | concept | overview | standard | source
created: 2026-06-30 # first written (don't change)
updated: 2026-06-30 # this edit (use the real date — never invent one)
tags: [i18n, routing]
sources: [src/js/localeUtils.ts, astro.config.mjs] # the repo files this page describes
status: stub | active | stable
---
```

Then prose. Rules:

- **Cite real code.** Anchor non-obvious claims to `path:line` (e.g. `src/js/localeUtils.ts:33`) so
  drift is detectable on the next `sync`. List the files a page covers in `sources:`. Never invent a
  file, symbol, function, or flag — if you can't find it in the repo, say so; verify before you write.
- **Link liberally** with `[[wiki-link]]` (e.g. `[[subsystems/i18n]]` or just `[[i18n]]`). A link to a
  page that doesn't exist yet is fine — it marks a page worth writing. Make links **bidirectional**:
  when A references B, add a back-reference on B.
- **Atomic pages.** One subsystem / one concept per page. Split when a page sprawls.
- **Flag drift & contradictions** with a callout instead of silently overwriting:
  `> [!warning] Drift — overview.md says X, but src/foo.ts:12 now does Y (2026-06-30).`
- **Slugs are kebab-case** (`token-architecture.md`). Prose over bullet-walls. Use the repo's own terms.

## Operations

### `sync <path | "all">` — re-ground the wiki against the code

The default operation (code changes, so this matters more than pure "ingest"):

1. **Read** the target files fully from the repo (a subsystem dir, a changed file, or everything).
2. For each affected area, **create or update** its `subsystems/` / `concepts/` page: fold in what's
   new, correct stale claims, re-anchor `path:line` citations, add drift callouts where the page
   disagreed with the code.
3. **Update `index.md`** — add/refresh the affected pages' one-line summaries.
4. **Update `overview.md`** if the change shifts the architecture.
5. **Append to `log.md`** (format below). Report what you touched and any drift you fixed.

A single change often touches several pages (a new integration → its subsystem page + overview +
index + maybe a concept). Integrate, don't just file.

### `ask <question>` — answer from the wiki

1. Read `index.md` first to locate relevant pages, then drill in (don't re-derive from source if the
   wiki already holds it — but if the wiki looks stale, `sync` the relevant path first).
2. Answer **with `[[citations]]`** to wiki pages (and through them, `path:line`).
3. **Offer to file** good answers back as a new page (a `flows/` walk-through, a `decisions/` record).
   A connection you discovered shouldn't vanish into chat. If filed, update `index.md` + `log.md`.

### `lint` — health-check the wiki

Produce a report (fix only what the human approves), then append a `lint` entry to `log.md`:

- **Dangling** `[[links]]` (point to missing pages) and **orphans** (no inbound links).
- **Stale claims** — a `path:line` citation that no longer matches the file; symbols/flags that moved
  or were removed.
- **Missing pages** — a subsystem or pattern referenced often but lacking its own page.
- **Missing cross-references** and **contradictions** between pages.
- **Data gaps** — a claim a quick web search or a re-read of the code could fill or verify; flag it.
- **Next questions / sources** — investigations worth running or external references worth `ingest`ing.

### `ingest <file>` — fold in an external reference

For non-code reference material the human drops in (a finished starter, an upstream doc, an ADR, a
design note). Write a summary page in `sources/` (`type: source`, recording what/where it is), then fold
its substance into the relevant `concepts/`/`subsystems/`/`ideal-template/` pages — each citing back to
the `[[sources/<name>]]` page. Update `index.md` + `log.md`. This is how external knowledge enters the
wiki without polluting the codebase-grounded pages.

## Discipline (the part that keeps it valuable)

Every `sync` updates `index.md` **and** `log.md`. Links are bidirectional. Claims cite `path:line`.
Drift is surfaced, not buried. The wiki only stays worth reading because the maintenance cost is near
zero — that's your job, not the human's.

## log.md format

Append-only, newest at the bottom; each entry starts with a grep-able prefix so
`grep "^## \[" wiki/log.md | tail -5` lists recent activity:

```
## [2026-06-30] sync | keystatic subsystem
Touched: subsystems/keystatic-cms, overview, index. Notes: added after the CMS was wired in.
```

Ops: `sync`, `ask`, `lint`, `ingest`, `refactor`. Use today's real date (derive it; never invent).
