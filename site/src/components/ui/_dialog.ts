// src/components/ui/_dialog.ts — shared open/close controller for Dialog and Sheet.
// Both render a native <dialog>; this single delegated listener wires the three behaviors they share:
//   • openers — any element with [data-dialog-open="<id>"] → dialog.showModal()
//   • closers — any element with [data-dialog-close] inside a <dialog> → dialog.close()
//   • backdrop light-dismiss — a click whose target IS the <dialog> and lands outside its panel box
// Escape-to-close is native to <dialog>, so it needs no JS. Delegated on `document`, so it binds ONCE
// and survives <ClientRouter /> view transitions — no astro:after-swap re-init (unlike Tabs, which
// binds per element). Imported as a side effect from both Dialog.astro and Sheet.astro; the module is
// an ES singleton, so the listener is attached exactly once however many <dialog>s are on the page.
// The entry/exit animations and the modal scroll-lock are CSS — see `_overlay.css`.

function handleClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const opener = target.closest<HTMLElement>("[data-dialog-open]");
  if (opener) {
    const id = opener.dataset.dialogOpen;
    const dialog = id ? document.getElementById(id) : null;
    if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
    return;
  }

  if (target.closest("[data-dialog-close]")) {
    target.closest("dialog")?.close();
    return;
  }

  // A click on the backdrop reports the <dialog> itself as the target; the panel is the dialog's own
  // box, so a point outside that box is the backdrop. Works for centered dialogs and edge sheets alike.
  if (target instanceof HTMLDialogElement) {
    const r = target.getBoundingClientRect();
    const inside =
      event.clientX >= r.left &&
      event.clientX <= r.right &&
      event.clientY >= r.top &&
      event.clientY <= r.bottom;
    if (!inside) target.close();
  }
}

document.addEventListener("click", handleClick);
