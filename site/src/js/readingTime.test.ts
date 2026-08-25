// Self-check for readingTime.ts. `pnpm test` type-strips + runs it.
import assert from "node:assert/strict";

import { readingTime } from "./readingTime.ts";

assert.equal(readingTime(""), 1, "empty body floors at 1 minute");
assert.equal(readingTime("   \n\t  "), 1, "whitespace-only floors at 1");
assert.equal(readingTime("word ".repeat(200)), 1, "200 words ≈ 1 minute");
assert.equal(readingTime("word ".repeat(400)), 2, "400 words ≈ 2 minutes");
assert.equal(readingTime("word ".repeat(1000)), 5, "1000 words ≈ 5 minutes");

console.log("readingTime.test.ts — all assertions passed");
