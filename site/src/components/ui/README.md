# UI primitives — the astro-boiler primitive contract

This folder is astro-boiler's **own** UI primitive library. It is informed by the proven
`tailwind-variants` shape (folder / `tv()` config / `index.ts` re-export) but it is **ours** — not a
vendored kit, not the Starwind CLI, not the `preline` package. Preline is a markup/states reference
only; never load `preline.js`.

This README is the source of truth for the pattern. Every primitive in `src/components/ui/` MUST
follow it.

## The contract — five rules

1. **One folder per primitive** — `src/components/ui/<name>/<Name>.astro` + `index.ts`. A compound
   primitive (e.g. Card) keeps each part as its own `.astro` file in the same folder.
2. **Typed props = native + variants** — `type Props = HTMLAttributes<tag> & VariantProps<typeof config>`
   (add `& { … }` for extra props like `href`/`src`).
3. **Export a `tv()` config** named after the component, so consumers can compose/extend it. A primitive
   that is a thin re-skin of another MAY instead compose that primitive's **exported recipe** rather than
   cloning it (e.g. **PaginationLink** reuses the `button` recipe; **Searchbox**'s trigger/dialog reuse the
   Dialog recipes and it exports only its own small wrapper recipe). Reuse over duplication — don't create
   redundant recipes for parts that already have one.
4. **Tokens only, never raw colors** — every class resolves to a semantic token (`bg-primary`,
   `text-foreground`, `border-input`, `ring-outline`, `bg-error`/`bg-success`, `rounded-md`). This is
   what keeps dark mode and re-theming free. The token defs live in `src/styles/global.css` +
   `tailwind-theme.css`.
5. **Merge consumer overrides** — destructure `class: className`, spread `...rest`, pass
   `class: className` through the config (so `tailwind-merge` lets the last conflicting utility win),
   and tag the root with `data-slot="<name>"` for styling hooks.

## The shape

```
src/components/ui/<name>/
├── <Name>.astro      # the component + its exported tv() config
└── index.ts          # re-exports { <Name>, <name> } (component + its recipe) and a default
```

```astro
---
// src/components/ui/<name>/<Name>.astro
import type { HTMLAttributes } from "astro/types";
import { tv, type VariantProps } from "tailwind-variants";

type Props = HTMLAttributes<"input"> & VariantProps<typeof field>;

export const field = tv({
  base: ["…layout + typography, token utilities only…"],
  variants: { size: { sm: "…", md: "…", lg: "…" } },
  defaultVariants: { size: "md" },
});

const { size, class: className, ...rest } = Astro.props;
---

<input class={field({ size, class: className })} data-slot="field" {...rest} />
```

```ts
// index.ts — re-export the component and its bare recipe by name (a compound primitive re-exports
// every part component and every part recipe; consumers import the recipe to compose/extend it).
import Field, { field } from "./Field.astro";

export { Field, field };
export default Field;
```

## Interactivity policy

Zero-JS / native HTML first (`<details>`, `<dialog>`, the Popover API, `:has()`/`peer`). Reach for a
tiny bundled `<script>` (ES module, re-init on `astro:after-swap`) only when native won't do. Never a
global plugin, never `preline.js`.

## The check

`/examples/ui` (dev-only — `src/pages/examples/[catalog].astro` emits no paths in a prod build)
renders every primitive in every variant via `@components/Sections/UiCatalog`. After adding or changing a primitive, run `pnpm lint` and `pnpm build`, then open
`/examples/ui` and eyeball it in **light and dark** mode (toggle in the header) — a missing token
shows up instantly as an un-themed element.

## Buttons: `.pixel-btn` vs `ui/button`

Two button systems exist on purpose, and reaching for the wrong one is the easiest way to get
something that looks nothing like the theme.

**`.pixel-btn`** (a global class in `src/styles/global.css`) is what 8-BitQuest's own CTAs use — the
notched pixel face with the inset depth shadow, in pink (default), `--blue`, or `--green`. Every
visible call to action in the theme is one: the hero CTAs, the header MENU button, the theme toggle,
the contact submit, the 404. Apply it to a plain `<a>` or `<button>` and size it with padding
utilities at the call site. If you are adding a CTA to a page, this is the one you want.

**`ui/button`** is the neutral stock primitive — rounded, token-coloured, `variant` + `size`, no pixel
treatment. It is deliberately *not* used by any page in the theme; it appears only in the
`/examples/ui` catalog, like the other stock primitives. It stays in the library for two reasons: it
is there for buyers who want a conventional button somewhere, and five primitives compose its exported
`button` recipe rather than cloning it (**PaginationLink**, **InputNumber**, **DialogTrigger**,
**DialogClose**, **DropdownTrigger**) — so deleting it would break those.

## Tier 1 (built)

Button · Input · Label · Textarea · Badge · Card (Image/Header/Title/Description/Action/Content/Footer,
`variant` + `size`) · Alert · Separator · Skeleton · Avatar.

- **Textarea** takes its default value as a `value` prop, like Input, even though the underlying
  element carries its value as content rather than as an attribute — the primitive writes it with
  `set:text`. That is what keeps call sites safe: children spread over several lines would put those
  newlines *inside* the element, where they become leading whitespace in the submitted value.

## Tier 2 (built)

Accordion (Item/Trigger/Content) · Tabs (List/Trigger/Content) · Tooltip · Breadcrumb
(Item/Link/Page/Separator) · Pagination (Item/Link/Ellipsis) · Progress · Spinner. All native-first:
Accordion is `<details>`, Tooltip is CSS-only, and only **Tabs** ships a tiny bundled `<script>`
(re-init on `astro:after-swap`, degrades to all-panels-visible). `PaginationLink` reuses the `button`
config rather than redefining one.

## Tier 3 (built)

Dialog (Trigger/Close/Header/Title/Description/Footer) · Sheet · Dropdown (Trigger/Menu/Item) ·
Select · Checkbox · Radio · Switch · Table (Header/Body/Footer/Row/Head/Cell/Caption). Native-first:

- **Dialog** and **Sheet** are native modal `<dialog>` (a Sheet is a Dialog pinned to an edge via a
  `side` variant). They share one delegated controller, `_dialog.ts` — openers carry
  `data-dialog-open="<id>"`, closers `data-dialog-close`, plus backdrop light-dismiss; Escape is
  native. It binds once and survives view transitions (no `astro:after-swap` re-init). Sheet reuses
  Dialog's `DialogTrigger`/`DialogClose` (re-exported as `SheetTrigger`/`SheetClose`) and the Dialog\*
  content parts. The fade/scale (Dialog) and per-side slide (Sheet) entry/exit animations, the
  `base-950` backdrop scrim, and the modal scroll-lock (`html:has(dialog:modal)`) live in `_overlay.css`
  — real `@starting-style` + `allow-discrete` transitions that honor `prefers-reduced-motion`.
- **Dropdown** is the native **Popover API** (`popover="auto"` + `popovertarget`): the menu renders in
  the top layer so it's never clipped, with native light-dismiss / Escape / focus-return. The shared
  `_popover.ts` controller (also driving MegaMenu) positions the menu under its trigger, reflows on
  scroll/resize, adds arrow-key roving (Up/Down/Home/End), and syncs `aria-expanded` (which flips the
  chevron). Trigger `for` = Menu `id`.
- **Select** is a native `<select>` reusing the shared `_field` look (size + validation `state`) with
  a token chevron — for a searchable/custom-dropdown select see **ComboBox** / **AdvancedSelect** in
  the advanced batch below.
- **Checkbox / Radio / Switch** are native inputs styled `appearance-none` with `peer` + `:checked`
  (Switch hides its checkbox `sr-only` and drives a track + thumb off `peer-checked`). Zero-JS.
- **Table** is static `<table>` styling in a scroll wrapper (sorting / data-grid out of scope).

## Advanced form controls (built)

Slider · InputNumber · ToggleCount (+ Value) · PasswordInput · PasswordStrength · ComboBox (+ Option)
· AdvancedSelect · Searchbox (+ Item). The Preline "advanced forms" set, native-first — no
`preline.js`, tokens only. Three (ComboBox, AdvancedSelect, Searchbox) were initially deferred as
"heavy JS" and built later; each keeps its own small bundled script (re-init on `astro:after-swap`)
and states its ceiling with a `ponytail:` note.

- **Slider** is a native `<input type="range">` styled through the range pseudo-elements — a `bg-muted`
  track (`::-webkit-slider-runnable-track` / `::-moz-range-track`) and a `bg-primary` thumb ringed in
  `background` (`::-webkit-slider-thumb` / `::-moz-range-thumb`); Firefox also fills
  `::-moz-range-progress`. Zero-JS.
- **InputNumber** is a native `<input type="number">` between two steppers (reusing the `button`
  config); a small script drives `stepUp()` / `stepDown()` and disables a stepper at its min/max bound.
- **ToggleCount** is a Monthly/Annual-style pricing toggle built on **Switch** — every
  `ToggleCountValue for={id}` swaps between its `min` / `max` text when the toggle flips.
- **PasswordInput** reuses the `input` field and adds a show/hide button (a script flips `type`,
  keeping `aria-pressed` / `aria-label` accurate). **PasswordStrength** is a 4-segment meter driven by
  the rule-based `scorePassword` (`password/strength.ts`) — its one runnable check is
  `password/strength.test.ts` (`node --experimental-strip-types …`).
- **ComboBox** (autocomplete) is a `role="combobox"` input over a filterable `role="listbox"` of
  `ComboBoxOption`s — ↑/↓ move the active option via `aria-activedescendant`, Enter commits.
- **AdvancedSelect** is a searchable single/multi select backed by a real (visually-hidden) native
  `<select>` for form submission; the styled trigger reuses the `_field` look. **Requires JS** — the
  zero-JS alternative is the native **Select**.
- **Searchbox** is a ⌘K command palette that reuses the **Dialog** (`<dialog>`) shell; a script filters
  `SearchboxItem`s, adds arrow-key nav, and binds the global shortcut.

`_dialog.ts`, `_popover.ts` (the Dropdown/MegaMenu placement controller), `_field.ts`,
`_Chevron.astro` (the one disclosure/select chevron glyph — rotation selectors stay at the call
sites), `_overlay.css`, `password/strength.ts`, and — for the filterable-listbox
trio — `_listbox.ts` (`filterByText` / `nextIndex` / `createActiveDescendant`) and `_client.ts`
(`onReady`, the load + `astro:after-swap` re-init contract every scripted primitive shares) are shared
internal modules (leading `_` or plain helpers), not primitives. The full catalog is browsable at the
dev-only `/examples` pages.

## Navigation & content (built)

MegaMenu (Trigger/Panel/Item) · List (+ Item). Native-first, no new JS beyond the shared controller:

- **MegaMenu** is a Dropdown with a wide multi-column panel (the same move as Sheet reusing Dialog):
  the panel is a Popover-API top layer placed by the shared `_popover.ts` controller — extracted from
  Dropdown, one delegated controller drives both, binds once, survives view transitions. The trigger
  reuses the `navLink` config so it sits between NavLinks in a Nav; the panel keeps natural Tab order
  (no roving — it's a grid of links, not a `role="menu"`). Click-to-open only (hover triggers are
  hostile to touch/keyboard — see the `ponytail:` note). `columns` (1/2/3) sets width + column count;
  MegaMenuItem is the Preline rich link (icon slot + title + description slot).
- **List** is the static Preline lists set: `marker` (none / disc / decimal — decimal renders an
  `<ol>`), `orientation="horizontal"` for the dot-separated inline list, and ListItem's `icon` slot
  for checked lists (flex is applied only when an icon is present, so disc/decimal markers survive).
  Zero-JS.
- **Breadcrumb** — the third piece of the Preline nav set — was already Tier 2; reused as-is.

## Theme toggle (built)

**ThemeToggle** — a manual light/dark override styled as the retro `.pixel-btn` (a global.css class, **not**
the `button` recipe); it exports a small `themeToggle` recipe for that square icon-button shell. The sun/moon icon flip is
**CSS-only** (via the `dark:` variant), so it's correct pre-paint with **no flash**; only the click ships
JS — toggle `.dark`, persist `localStorage("colorTheme")`, sync `aria-pressed`, re-init through
`_client.ts`. Unlike the rest of the library it is **not purely additive**: it pairs with a one-time edit
to `src/layouts/BaseHead.astro`'s inline pre-paint script, which now reads `localStorage("colorTheme")`
(a saved pick wins; otherwise it follows the device and only auto-follows OS changes while unpinned). That
script stays **inline** pre-paint — moving it to a bundled `<script>` reintroduces the theme flash (the
CLAUDE.md gotcha). The primitive itself is config-free; gate device-only behavior on a `siteSettings`
flag at the call site if a project wants it.

## Reveal — motion primitive (built)

**Reveal** (`ui/reveal/`) — a reveal-on-scroll wrapper, the one primitive that's about motion. It
composes the owned animation catalog (`src/styles/motion/index.css`): an entrance `animate-*` driven by the
**native** scroll timeline (`timeline-view` = `animation-timeline: view()`), so it's **zero-JS**. It
follows `siteSettings.useAnimations` (off ⇒ plain pass-through wrapper) with a per-call `animate`
override, and carries `motion-reduce:animate-none` so reduced motion degrades to static content (the
global reduced-motion guard zeroes time durations but can't stop a scroll-driven animation — see the
`ponytail:` note in the file). The whole motion system — the catalog, the guard, and the two switches
(`prefers-reduced-motion` vs `useAnimations`) — lives in `src/styles/motion/` and is documented in
its file headers and AGENTS.md.
