# Sections — the astro-boiler section contract

A **section** is a layout-free block of page content (a hero, a feature grid, a legal article).
Pages stay thin route shells: `src/pages/*` owns `BaseLayout` + SEO (title, description, noindex,
schema) and composes sections; a section never imports `BaseLayout`.

## Layout

```
src/components/Sections/
├── Global/          # shared across pages: Header, HeaderNavLinks, Footer, HeroPanel,
│                 #   SectionHeading, CardGrid, Scoreboard
└── <Page>/          # sections of one page: Home/, About/, Blog/, Project/, Contact/, Legal/, NotFound/, UiCatalog/
    └── <Name>.astro # PascalCase, one file per section
```

- **Global vs page-specific**: a section used by 2+ pages moves to `Global/`; until then it lives
  under its page's folder. **`Global/` exists** and holds the cross-page sections — `Header`,
  `Footer`, `SectionHeading`, `CardGrid`, and `Scoreboard` (the last three were promoted here from
  `Home/` once other pages reused them). Sub-parts of a section (e.g. `NotFoundIllustration`) sit as
  sibling files in the same folder and are imported relatively (`./NotFoundIllustration.astro`).
- **Data flows in from the route.** A section either receives its content as typed props (see
  `Legal/LegalArticle.astro`) or reads config itself via the `@js` helpers — never both for the
  same data.
- **Build sections from the primitives** in `@components/ui/*` and `@components/Cards/*`; tokens
  only, no raw colors (see AGENTS.md: token discipline).
