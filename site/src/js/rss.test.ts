/**
 * Runnable self-check for the RSS renderer in ./rss.ts — no test framework. Covers the escaping
 * (a security boundary) and the item/document shape. Run: `pnpm test`, or directly
 * `node --experimental-strip-types src/js/rss.test.ts`.
 */
import assert from "node:assert/strict";

import { escapeXml, renderRssFeed, renderRssItem } from "./rss.ts";

// escapeXml handles all five XML predefined entities.
assert.equal(escapeXml(`&<>"'`), "&amp;&lt;&gt;&quot;&apos;", "all five entities escaped");
assert.equal(escapeXml("plain text"), "plain text", "no false positives");

// A malicious title can't break out of the <title> element.
const item = renderRssItem({
  title: `Pwn</title><script>alert(1)</script>`,
  url: "https://acme.com/blog/p/",
  description: "d & d",
  pubDate: new Date("2026-01-02T03:04:05Z"),
});
assert.ok(!item.includes("<script>"), "raw <script> must not survive into the item");
assert.ok(item.includes("&lt;script&gt;"), "angle brackets are escaped");
assert.ok(
  item.includes('<guid isPermaLink="true">https://acme.com/blog/p/</guid>'),
  "guid is the permalink url",
);
assert.ok(item.includes("02 Jan 2026 03:04:05 GMT</pubDate>"), "pubDate is RFC-822 UTC");

// A `&` in a URL is entity-escaped in both link and guid, so the document stays well-formed XML.
const ampItem = renderRssItem({
  title: "T",
  url: "https://acme.com/blog/p/?a=1&b=2",
  description: "d",
  pubDate: new Date("2026-01-02T03:04:05Z"),
});
assert.ok(ampItem.includes("?a=1&amp;b=2</link>"), "ampersand in url escaped in link");
assert.ok(ampItem.includes("?a=1&amp;b=2</guid>"), "ampersand in url escaped in guid");

// The feed wraps items in a valid channel and escapes channel metadata too.
const xml = renderRssFeed(
  { title: "A & B", link: "https://acme.com/blog/", description: "d<e", language: "en-US" },
  [
    {
      title: "T",
      url: "https://acme.com/blog/t/",
      description: "D",
      pubDate: new Date("2026-01-01T00:00:00Z"),
    },
  ],
);
assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), "xml prolog present");
assert.ok(xml.includes("<title>A &amp; B</title>"), "channel title escaped");
assert.ok(xml.includes("<description>d&lt;e</description>"), "channel description escaped");
assert.ok(xml.includes("<language>en-US</language>"), "language emitted");
assert.ok(
  xml.includes("<link>https://acme.com/blog/t/</link>"),
  "the item renders inside the channel",
);

console.log("rss.test: ok");
