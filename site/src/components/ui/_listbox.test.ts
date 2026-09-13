/**
 * Runnable self-check for the shared listbox keyboard math in ./_listbox.ts — `nextIndex` is the
 * roving-active-descendant step behind ↑/↓/Home/End in ComboBox, Searchbox, and AdvancedSelect.
 * Run: `pnpm test`, or `node --experimental-strip-types src/components/ui/_listbox.test.ts`.
 * (filterByText / createActiveDescendant are DOM-bound and covered by the browser catalog, not here.)
 */
import assert from "node:assert/strict";

import { nextIndex } from "./_listbox.ts";

// Empty list: there is nowhere to move.
assert.equal(nextIndex(0, -1, 1), -1, "empty list yields -1 (Down)");
assert.equal(nextIndex(0, 2, -1), -1, "empty list yields -1 regardless of current");

// From nothing-active (-1): Down lands on the first, Up on the last.
assert.equal(nextIndex(3, -1, 1), 0, "from -1, Down -> first");
assert.equal(nextIndex(3, -1, -1), 2, "from -1, Up -> last");

// Stepping within bounds.
assert.equal(nextIndex(3, 0, 1), 1, "Down steps forward");
assert.equal(nextIndex(3, 1, -1), 0, "Up steps back");

// Wrap-around at the ends.
assert.equal(nextIndex(3, 2, 1), 0, "Down past the last wraps to the first");
assert.equal(nextIndex(3, 0, -1), 2, "Up past the first wraps to the last");

// A single option: both directions stay put.
assert.equal(nextIndex(1, 0, 1), 0, "single item, Down stays");
assert.equal(nextIndex(1, 0, -1), 0, "single item, Up stays");

console.log("_listbox.test: ok");
