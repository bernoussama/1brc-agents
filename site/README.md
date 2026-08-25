# 1BRC-Agents site

Astro site for the [1BRC-Agents](https://github.com/bernoussama/1brc-agents)
project, based on the
[8-BitQuest](https://github.com/Astro-Craft-Theme/8-BitQuest) theme (Astro 7 +
Tailwind CSS v4).

## Quick start

```sh
cd site
pnpm install
pnpm dev          # http://localhost:4321
```

## Content

| Path | Role |
| --- | --- |
| `src/config/siteData.json.ts` | Site name, description, GitHub `sameAs` |
| `src/config/portfolioData.json.ts` | Home / about copy for the benchmark |
| `src/data/blog/measuring-autonomous-coding-agents-on-1brc/` | Engineering blog draft |
| `src/data/projects/1brc-agents/` | Project card for the harness |

The blog post body tracks `notes/1brc-agents-blog-draft.md` in the repo root
(with absolute GitHub links for in-repo paths).

## Commands

| Command | Action |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build to `dist/` |
| `pnpm check` | `astro check` |
| `pnpm test` | Theme self-checks under `src/` |

Set `SITE_URL` to your production domain before a production deploy (see
`astro.config.mjs`). Contact form mail needs Resend secrets from `.env.example`
if you enable that route.
