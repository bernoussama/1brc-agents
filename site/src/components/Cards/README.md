# Cards — composed card components

A **card** here is a content-aware composition — it renders a content shape (a blog post, a project)
and is what sections map over. It builds on the `ui/` primitives; the content awareness is the part a
generic primitive can't have.

```
src/components/Cards/
├── ContentCard.astro    # post/project card: badge + title + excerpt + optional tags + a "READ →"/"VIEW →" CTA
└── PixelCardLink.astro  # the shared hover-lift <a> shell (ui/pixel-panel surface + thumbnail tile)
```

`ContentCard` renders the normalized card shape that `@js/postCards` (`toPostCard`) and `@js/projectCards`
(`toProjectCard`) build from the collections — posts and projects share the `PixelCardLink` shell, so only
the badge tone, the optional tags, and the CTA verb differ. Both build on **`ui/pixel-panel`** (via
`PixelCardLink`), **not** `ui/card`: the pixel cards need `<a>`/`<article>` semantics and the pixel
structure the generic `ui/card` `<div>` doesn't give. Add the next card here (PascalCase, typed props for
its data shape) so it has one obvious home instead of being inlined into a section.
