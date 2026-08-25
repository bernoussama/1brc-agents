# Icons — `<Icon />`

553 24×24 line icons, one component, one typed registry, zero new dependencies. They come from the
**Stratis UI Icons** Figma Community file — _General_, _Arrows_ (partial), _Media & Devices_,
_Alerts_, _Security_, _Images_, _Files_, _Charts_, _Development_, _Communication_, _Editor_ (still to
import: Arrows columns 4–5, _Finance_, any remaining frames). Attribution and licence terms live in
[`THIRD-PARTY.md`](../../../THIRD-PARTY.md) at the repo root — read it before you redistribute.

> This is a **stock library for your customisation**, not a set the theme itself draws on. The
> theme's own UI runs entirely on the separate pixel-art set in [`../pixel-icons/`](../pixel-icons/);
> `<Icon />` appears only in the `/examples/ui` catalog. Deleting that catalog (README → "Before you
> deploy") leaves this registry unreferenced — keep the folder if you want the icons, delete it if
> you don't.

An earlier version also shipped 18 filled brand marks (`facebook`, `github`, `linkedin`, …) from a
second Figma file, _Social Media Icons 24x24_. **Those were removed.** A trademarked brand mark is
governed by the brand owner's guidelines regardless of what the Figma file permits, nothing in the
theme used them, and shipping them dropped a licence question in the buyer's lap for no benefit.
`youtube` survives because it is a Stratis _line_ icon rather than one of that set — still a
trademark, still unused by the theme.

```astro
---
import { Icon } from "@components/svg/icons";
---

<Icon name="activity" />
<Icon name="trash-01" size="lg" class="text-error" />
<Icon name="search-01" title="Search" />
<!-- accessible name -->
```

- **`name`** — a typed `IconName`; illegal names fail `astro check`. Autocomplete lists every icon.
- **`size`** — `sm` `md` `lg` `xl` (`size-4…size-8`, default `md`). Or just pass `class="size-6"`.
- **color** — geometry is `currentColor`; recolor with any `text-*` token (`text-primary`,
  `text-muted-foreground`, …). Dark mode is free.
- **a11y** — decorative by default (`aria-hidden`). Pass `title` to expose an accessible name
  (`role="img"` + `<title>`).

Follows the [primitive contract](../../ui/README.md): `data-slot="icon"`, exported `tv()` config
(`icon`), native `svg` props + variant props, merged `class`, tokens only.

## Contents

`icons.ts` is **generated** — `ICONS` maps each name to the inner SVG markup, plus the `IconName`
union and an `iconNames` array (handy for galleries). Treat it as an artifact: to change a glyph,
re-import it from the source rather than editing the string in place.

> `ponytail:` the whole registry is one module (~435 KB at 553 icons). It stays build-time —
> icons inline into HTML and nothing lands in client JS — but every icon markup loads even if a
> page uses one. Ceiling/upgrade path: importing it in a client `<script>` would ship it all;
> at that point split to per-file `.svg` imports (Astro native SVG components) or an SVG sprite.

## Adding more icons

**The generator that produced this file is not in the repo.** It lived in the scratchpad used to
build the set, alongside a `manifest.json` node-id cache that was never committed either. Rather
than walk you through a flow whose scripts are missing, here is what the next import actually needs
and the quirks that cost time the first time round.

Each category is one frame of the source Figma file. Call the Figma MCP `get_design_context` on the
category **frame** node — one call per frame is enough, and per-column pulls are the fallback when a
frame response is too large. The response is React reference code: a `const imgX = "<asset url>"`
table plus one function per icon carrying `data-node-id` / `data-name` and its `src={imgX}`
(occasionally the `<img>` nests one wrapper `<div>` deeper — match both shapes). Collect
`{ id, name, url }` keyed by **node id**, not name: `data-name`s are not unique in the source.

Then download each SVG and normalise it before it lands: recolor to `currentColor`, flatten bare
`<g>` wrappers, strip ids, scale-to-fit the few off-grid viewBoxes, and dedupe by cleaned content
against the existing registry. Assert on anything unexpected — a `<g transform>`, a colour that
wouldn't normalise, an empty icon — so a bad export fails loudly instead of shipping a broken glyph.

Watch for these, all real in the Stratis file: duplicate `data-name`s on `-01`/`-02` variants, a
checkmark labelled `message-square-plus`, and icons named `Component` or `-`. Fix those with a
node-id-keyed name override at import time, never by hand-editing `icons.ts`.

> Heads-up: `get_design_context` counts against a per-account Figma MCP tool-call quota (the
> Starter plan caps it and paywalls further calls — frame-level pulls covered 9 categories in
> ~10 calls). Pull a few frames at a time.

If you are adding filled brand marks, read the removal note above first.
