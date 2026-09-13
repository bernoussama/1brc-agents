// src/components/ui/_popover.ts — shared placement controller for anchored top-layer popovers
// (Dropdown's menu, MegaMenu's panel). The Popover API handles open/close/light-dismiss/Escape
// natively; this only does placement + aria-expanded sync (which flips the trigger chevron) +
// Dropdown's arrow-key roving + close-on-item-activate. Delegated on document/window, so it binds ONCE and survives
// <ClientRouter /> view transitions — no astro:after-swap re-init. Imported as a side effect from
// Dropdown.astro and MegaMenu.astro; the module is an ES singleton, so listeners attach exactly once.

const GAP = 4;

// Anchored popovers this controller drives. A new anchored primitive opts in by adding its
// data-slot here (its panel must be `popover` + `fixed`, toggled by a `popovertarget` trigger).
const ANCHORED_SLOTS = new Set(["dropdown-menu", "mega-menu-panel"]);

function triggerFor(panel: HTMLElement): HTMLElement | null {
  return panel.id ? document.querySelector<HTMLElement>(`[popovertarget="${panel.id}"]`) : null;
}

function menuItems(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>('[data-slot="dropdown-item"]:not([disabled])')];
}

// Place the panel under its trigger, aligned to the requested edge; flip above when there's no room
// below; clamp into the viewport. Called before the panel is shown (sizes read as 0 → start-aligned
// provisional placement, no flash) and again once it's measurable.
function place(panel: HTMLElement): void {
  const trigger = triggerFor(panel);
  if (!trigger) return;
  const t = trigger.getBoundingClientRect();
  const m = panel.getBoundingClientRect();
  const end = panel.dataset.align === "end";
  let left = end && m.width ? t.right - m.width : t.left;
  if (m.width) left = Math.max(GAP, Math.min(left, window.innerWidth - m.width - GAP));
  let top = t.bottom + GAP;
  if (m.height && top + m.height > window.innerHeight - GAP && t.top - m.height - GAP > 0) {
    top = t.top - m.height - GAP;
  }
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function isAnchored(node: EventTarget | null): node is HTMLElement {
  return node instanceof HTMLElement && ANCHORED_SLOTS.has(node.dataset.slot ?? "");
}

const openPanels = new Set<HTMLElement>();

// `toggle` / `beforetoggle` don't bubble — capture catches them via the document.
document.addEventListener(
  "beforetoggle",
  (event) => {
    const e = event as Event & { newState?: string };
    if (isAnchored(e.target) && e.newState === "open") place(e.target);
  },
  true,
);

document.addEventListener(
  "toggle",
  (event) => {
    const e = event as Event & { newState?: string };
    if (!isAnchored(e.target)) return;
    const panel = e.target;
    const trigger = triggerFor(panel);
    if (e.newState === "open") {
      place(panel);
      openPanels.add(panel);
      trigger?.setAttribute("aria-expanded", "true");
      // Dropdown menus focus their first item; a mega-menu panel has none, so focus stays on the
      // trigger and Tab walks the panel's links in natural order — the right model for a link grid.
      menuItems(panel)[0]?.focus();
    } else {
      openPanels.delete(panel);
      trigger?.setAttribute("aria-expanded", "false");
    }
  },
  true,
);

const reflow = () => openPanels.forEach(place);
window.addEventListener("scroll", reflow, true);
window.addEventListener("resize", reflow);

// Activating an item dismisses its popover (menu semantics; links then navigate). Light dismiss
// can't do this — clicks INSIDE a popover never light-dismiss it. Hiding while focus is inside
// natively returns focus to the trigger.
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const item = event.target.closest('[data-slot="dropdown-item"], [data-slot="mega-menu-item"]');
  const panel = item?.closest<HTMLElement>(
    '[data-slot="dropdown-menu"], [data-slot="mega-menu-panel"]',
  );
  if (panel?.matches(":popover-open")) panel.hidePopover();
});

// Arrow-key roving is Dropdown-only (role="menu" semantics) — it keys on dropdown-menu, so a
// mega-menu panel keeps natural Tab order.
document.addEventListener("keydown", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  const menu = event.target.closest<HTMLElement>('[data-slot="dropdown-menu"]');
  if (!menu) return;
  const items = menuItems(menu);
  if (items.length === 0) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  switch (event.key) {
    case "ArrowDown":
      next = i < 0 ? 0 : (i + 1) % items.length;
      break;
    case "ArrowUp":
      next = i <= 0 ? items.length - 1 : i - 1;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = items.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  items[next]?.focus();
});
