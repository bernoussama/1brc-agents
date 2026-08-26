// src/components/ui/_listbox.ts — shared client-side helpers for the filterable-listbox primitives
// (ComboBox, Searchbox, AdvancedSelect). Pure functions plus one small roving-active-descendant
// factory, imported into each component's bundled <script>. Not a primitive — the leading `_` marks it
// an internal shared module, mirroring _field.ts (shared field look) and _dialog.ts (shared controller).

/**
 * Show only the items whose text matches `query` (case-insensitive substring), hide the rest, and
 * toggle an optional empty-state element on/off. Returns the still-visible items.
 *
 * @example const shown = filterByText(options, input.value, emptyEl);
 */
export function filterByText<T extends HTMLElement>(
  items: T[],
  query: string,
  emptyEl?: HTMLElement | null,
): T[] {
  const q = query.trim().toLowerCase();
  const shown: T[] = [];
  for (const el of items) {
    el.hidden = !(el.textContent ?? "").toLowerCase().includes(q);
    if (!el.hidden) shown.push(el);
  }
  emptyEl?.classList.toggle("hidden", shown.length > 0);
  return shown;
}

/** Next index for wrap-around roving; from -1 (nothing active) it lands on the first/last per `dir`. */
export function nextIndex(length: number, current: number, dir: 1 | -1): number {
  if (length === 0) return -1;
  return current < 0 ? (dir > 0 ? 0 : length - 1) : (current + dir + length) % length;
}

/** The roving controller returned by {@link createActiveDescendant}. */
export interface ActiveDescendant {
  /** the currently-visible (non-hidden) options, in DOM order */
  visible: () => HTMLElement[];
  /** the active option, or null when none is set */
  active: () => HTMLElement | null;
  /** set (or clear, with null) the active option and sync aria-* + scroll */
  setActive: (item: HTMLElement | null) => void;
  /** step the active option among the visible ones (wrap-around) */
  move: (dir: 1 | -1) => void;
}

/**
 * Roving active-descendant over a listbox where focus stays in `input` (the WAI-ARIA combobox
 * pattern): the active option is tracked via `input`'s `aria-activedescendant` and each option's
 * `aria-selected`. `move` steps through the currently-visible options only. Options must already
 * carry stable ids.
 */
export function createActiveDescendant(input: HTMLElement, items: HTMLElement[]): ActiveDescendant {
  const visible = (): HTMLElement[] => items.filter((i) => !i.hidden);
  const active = (): HTMLElement | null =>
    items.find((i) => i.id === input.getAttribute("aria-activedescendant")) ?? null;
  const setActive = (item: HTMLElement | null): void => {
    for (const i of items) i.setAttribute("aria-selected", String(i === item));
    if (item) {
      input.setAttribute("aria-activedescendant", item.id);
      item.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };
  const move = (dir: 1 | -1): void => {
    const vis = visible();
    const cur = active();
    const i = nextIndex(vis.length, cur ? vis.indexOf(cur) : -1, dir);
    if (i >= 0) setActive(vis[i]);
  };
  return { visible, active, setActive, move };
}
