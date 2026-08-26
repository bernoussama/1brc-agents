// src/components/ui/password/strength.test.ts — the one runnable check for scorePassword (no framework).
// Run: `node --experimental-strip-types src/components/ui/password/strength.test.ts` (Node >= 22.12).
import assert from "node:assert/strict";

import { scorePassword } from "./strength.ts";

assert.equal(scorePassword(""), 0); // empty
assert.equal(scorePassword("abc"), 0); // too short, single class
assert.equal(scorePassword("abcdefgh"), 1); // length only
assert.equal(scorePassword("abcdefghijkl"), 2); // longer, still one class
assert.equal(scorePassword("Abcdefghijkl"), 3); // long + mixed case
assert.equal(scorePassword("Abcd1234!xyz"), 4); // long + mixed + digit + symbol

console.log("scorePassword ok");
