// src/components/ui/_client.ts — shared client-side bootstrap for primitives with a bundled <script>.
// `onReady` runs `wire` for every matching element on load AND after each <ClientRouter /> view
// transition (astro:after-swap) — the re-init contract every interactive primitive needs, in one place
// so it can't be forgotten. Not a primitive; the leading `_` marks it internal (see _field.ts / _dialog.ts).

/** Wire every element matching `selector` now, and again after each view-transition swap. */
export function onReady(selector: string, wire: (el: HTMLElement) => void): void {
  const init = () => document.querySelectorAll<HTMLElement>(selector).forEach(wire);
  init();
  document.addEventListener("astro:after-swap", init);
}
