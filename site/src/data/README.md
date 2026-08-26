# Content collections

Schemas live in `src/content.config.ts`. There are three collections, and the two MDX ones nest one
folder deep so an entry can keep its images beside it, while `authors` is flat:

```
src/data/
├── blog/<slug>/index.mdx       # entry id => "<slug>"
├── projects/<slug>/index.mdx   # entry id => "<slug>"
└── authors/<name>.md           # entry id => "<name>", e.g. authors/admin.md
```

Format post dates with `formatDate(date)` from `@js/textUtils`.

## Replacing the demo content

The six posts and six projects are placeholders — delete them and add your own. Two things to know,
both verified:

**Clear the content-layer cache after deleting entries.** Astro's content layer keeps a persistent
store at `node_modules/.astro/data-store.json`, and it survives `rm -rf .astro`. If you delete an
entry without clearing it, the next build still tries to render the deleted route and fails with
`UnknownContentCollectionError: Unexpected error while rendering → <slug>` — naming a file you
already removed, which is a confusing place to land. Fix:

```sh
rm -rf node_modules/.astro .astro dist && pnpm build
```

**Order doesn't matter, and deleting the author is safe.** Every sample post references the `admin`
author, but the byline resolves with a fallback (`src/pages/blog/[slug].astro`) — delete
`authors/admin.md` and posts still build, showing `siteData.author.name` with no avatar instead. So
you can empty the collections in any order. With all three emptied, the build succeeds and `/blog/`
and `/projects/` render `CardGrid`'s empty state; you will see a
`The collection "blog" does not exist or is empty` warning, which is expected until you add an entry.

If you re-add i18n, nest per-locale folders (`blog/<locale>/<slug>/` → id `"<locale>/<slug>"`)
and restore a language filter — the removed helpers are in git history.
