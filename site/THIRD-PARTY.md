# Third-party notices

The 8-BitQuest template is licensed under [`LICENSE`](./LICENSE). The material listed here is **not**
covered by that licence — it belongs to other people and carries their terms. Section 6 of `LICENSE`
makes complying with those terms the licensee's responsibility.

Two things in this file need your attention before you redistribute or deploy commercially: the Figma
Community licences in section 2, which you should verify against each file's current listing, and the
demo images in section 5, whose provenance is not recorded in this repository.

---

## 1. Fonts — bundled and served

Both fonts are installed as npm packages and their `.woff2` files are copied into the build output, so
they travel with every deployment.

**Press Start 2P** — Copyright (c) 2012 Cody "CodeMan38" Boisclair.
Licensed under the SIL Open Font License, Version 1.1.
Shipped via [`@fontsource/press-start-2p`](https://www.npmjs.com/package/@fontsource/press-start-2p);
the full licence text is at `node_modules/@fontsource/press-start-2p/LICENSE`.

**Space Mono** — Copyright (c) 2016 Colophon Foundry.
Licensed under the SIL Open Font License, Version 1.1.
Shipped via [`@fontsource/space-mono`](https://www.npmjs.com/package/@fontsource/space-mono); the full
licence text is at `node_modules/@fontsource/space-mono/LICENSE`.

The OFL permits bundling and web-serving. It requires that the font files keep their copyright notice
and licence, that a Reserved Font Name is not reused on a modified version, and that the fonts are not
sold on their own. Serving them as part of a website is exactly the intended use.

## 2. Icons — from Figma Community files

> **Verify these before redistributing.** Figma Community licences are set per file by their author
> and are not uniform — some are CC BY (attribution required), some are non-commercial, and an author
> can change the terms after publication. The Licensor has not obtained a written licence grant from
> either author. Open each file's Community listing, read the licence stated there, and satisfy
> yourself that your use is covered. If a listing turns out to be non-commercial, delete the set
> rather than ship it.

### Stratis UI Icons — `src/components/svg/icons/`

553 24×24 line icons, generated into `icons.ts`. Source: the "Stratis UI Icons" Figma Community file.

This set is **stock for your customisation** — no page in the theme uses it. It is referenced only by
the `/examples/ui` catalog, which the README tells you to delete before deploying. If the licence
question is not worth resolving for you, delete `src/components/svg/icons/` and the catalog sections
that import it; nothing in the theme breaks.

`youtube` in this set is a YouTube trademark rendered as a line icon. It is unused by the theme. See
section 3.

An earlier version of this template also shipped 18 filled brand marks from a second Figma Community
file, "Social Media Icons 24x24" — `facebook`, `instagram`, `tiktok`, `threads`, `messenger`,
`whatsapp`, `telegram`, `behance`, `github`, `discord`, `linkedin`, `slack`, `line`, `apple`,
`google`, `pinterest`, `google-play`, `bluesky`. **They have been removed** and that file is no longer
a dependency of this template. Do not re-add them without reading section 3 first.

### 1300 Free Pixel Icons — `src/components/svg/pixel-icons/`

18 pixel-art glyphs, hand-ported into `pixelIcons.ts`. Source: the "1300 Free Pixel Icons" Figma
Community file, `CsRVZj1WwtKNAuqZEE2NT0`.

Unlike the set above, **this one is load-bearing** — it is the theme's real icon system. All 18 glyphs
are used: the theme toggle, the footer social row, the home contact chips, the tech-stack and
skill-tree lists, and the blog/project article navigation. It cannot be deleted without rebuilding
those.

Four of the 18 are brand marks: `linkedin`, `youtube`, `twitter`, `github`. See section 3.

## 3. Trademarks

The brand marks noted above — `linkedin`, `youtube`, `twitter`, `github` in the pixel set, and
`youtube` in the line set — are **trademarks of their respective owners**. Neither `LICENSE` nor any
Figma Community licence grants you a right to use them: a trademark is governed by the brand owner's
own guidelines, independently of the copyright in the drawing.

Linking to your own profile on a platform, using that platform's mark as the link's icon, is the
conventional and generally tolerated case, and it is what the footer and home contact row do. It is
still your call to make. Before you deploy commercially, check the relevant brand guidelines, and in
particular do not imply endorsement, affiliation, or partnership, and do not use a mark on a product
or in a logo of your own.

If you would rather not carry the exposure at all, the four pixel marks are drawn in
`src/components/svg/pixel-icons/pixelIcons.ts` and referenced from
`src/components/Sections/Global/Footer.astro` and `src/components/Sections/Home/Contact.astro`.
Replacing them with generic glyphs is a contained change.

## 4. Code ports

### tailwind-animations — `src/styles/motion/`

The animation catalog is a dependency-free port of **tailwind-animations**, adapted to Tailwind v4
CSS-first syntax and this template's conventions. The MIT licence requires its copyright and
permission notice to travel with any copy or substantial portion, which is why the full text follows.

> MIT License
>
> Copyright (c) 2024 Miguel Ángel Durán (@midudev) and contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Upstream: <https://tailwind-animations.com> · <https://github.com/midudev/tailwind-animations>

Changes from upstream are listed in the header comment of `src/styles/motion/index.css`:
`--animate-pulse` dropped as a duplicate of Tailwind's built-in, a global `prefers-reduced-motion`
guard added, and an owned scroll-driven extension added.

### "Pure CSS 8bit Button Style" — `src/styles/global.css`

The `.pixel-btn` class is a port of the CodePen pen "Pure CSS 8bit Button Style" by Maximuz
(<https://codepen.io/Maximuz/pen/BdqXXN>).

**No licence is stated on the pen.** CodePen's terms make a pen's author its copyright holder; pens
posted publicly may be viewed and learned from, but that is not the same as a licence to redistribute.
The port here is a reimplementation of a widely-known technique — a flat face, an inset shadow for
depth, and two pseudo-elements drawing a notched border — rather than a copy of the original
stylesheet, and the tokens, variants, focus handling, and sizing are this template's own. It is a
small amount of CSS expressing a common idea, which is a weak subject for copyright.

That reasoning is offered so you can evaluate it, not as a legal opinion. If you would rather not
rely on it, the class is self-contained at `src/styles/global.css` and roughly 50 lines; rewriting the
border geometry from scratch is straightforward.

## 5. Demo images — provenance not recorded

**Action required by the template owner.** These ten raster files ship in the repository, and this
repository records nothing about where they came from or under what terms:

- `public/og.jpg`, `public/favicon.ico`, `public/favicon.svg`
- `src/assets/images/hero-avatar.jpg`, `src/assets/images/about-avatar.png`
- `src/assets/images/demo/post-css-grid.jpg`, `post-floppy-disk.jpg`, `post-retro-deploy.jpg`
- `src/assets/images/demo/project-cli-quest.png`, `project-pixel-art.png`, `project-retro-chat.png`

If they are the owner's own work or AI-generated, say so here and the matter is closed. If any came
from a stock library, an image search, or another template, its terms must be checked and stated —
or the file replaced.

They are placeholder content in any case: every one is demo material the buyer is expected to swap
(README → "Before you deploy"). The buyer's own replacements are the buyer's responsibility.

## 6. Build and runtime dependencies

The npm packages this template depends on are not redistributed by it — they install from the registry
into the buyer's own `node_modules`, each with its own licence file. At the time of writing, every
direct dependency is MIT: `astro`, `@astrojs/cloudflare`, `@astrojs/mdx`, `@astrojs/sitemap`,
`tailwindcss`, `@tailwindcss/vite`, `tailwind-merge`, and `tailwind-variants`, plus the dev
toolchain. Run `pnpm licenses list` to audit the resolved tree yourself.

---

_Last reviewed: 2026-07-30._
