// Run: pnpm test  (or: node --experimental-strip-types src/js/nav.test.ts)
import assert from "node:assert/strict";

import { isActive } from "./nav.ts";

// home matches only itself — never as a prefix of every route
assert.equal(isActive("/", "/"), true);
assert.equal(isActive("/about/", "/"), false);

// exact non-home match, tolerant of a missing trailing slash on either side
assert.equal(isActive("/about/", "/about/"), true);
assert.equal(isActive("/about", "/about/"), true);
assert.equal(isActive("/about/", "/about"), true);

// a descendant activates its section root (blog post highlights `Blog`)
assert.equal(isActive("/blog/hello-world/", "/blog/"), true);

// sibling prefixes must NOT false-match ("/aboutus/" is not under "/about/")
assert.equal(isActive("/aboutus/", "/about/"), false);
assert.equal(isActive("/contact/", "/about/"), false);

console.log("nav.isActive: all assertions passed");
