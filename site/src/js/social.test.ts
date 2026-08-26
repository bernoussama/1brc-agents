// Run: pnpm test  (or: node --experimental-strip-types src/js/social.test.ts)
import assert from "node:assert/strict";

import { socialUrl } from "./social.ts";

const sameAs = ["https://github.com/acme", "https://www.linkedin.com/in/acme"];

// matches on a single host substring, returns the profile URL
assert.equal(socialUrl(sameAs, "github.com", "https://github.com/"), "https://github.com/acme");
assert.equal(
  socialUrl(sameAs, "linkedin.com", "https://www.linkedin.com/"),
  "https://www.linkedin.com/in/acme",
);

// matches on ANY of several hosts (x.com OR twitter.com)
assert.equal(
  socialUrl(["https://twitter.com/acme"], ["x.com", "twitter.com"], "https://x.com/"),
  "https://twitter.com/acme",
);

// falls back when nothing matches, or the list is empty / undefined
assert.equal(
  socialUrl(sameAs, "youtube.com", "https://www.youtube.com/"),
  "https://www.youtube.com/",
);
assert.equal(socialUrl([], "github.com", "https://github.com/"), "https://github.com/");
assert.equal(socialUrl(undefined, "github.com", "https://github.com/"), "https://github.com/");

console.log("social.socialUrl: all assertions passed");
