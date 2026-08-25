/**
 * * Dependency-free RSS 2.0 rendering for the blog feed — the pure, testable core of the /rss.xml
 * endpoint (src/pages/rss.xml.ts), which only supplies the posts + the resolved `site` URL. Extracted
 * so the escaping (a security boundary) and the item/document shape are covered by rss.test.ts;
 * hand-rolled like everything else in <head>, no @astrojs/rss (see AGENTS.md: SEO is owned).
 */

/** Escape the five XML predefined entities so a title/description/URL can't break the document. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface RssItem {
  title: string;
  /** absolute URL of the post (also used as its guid) */
  url: string;
  description: string;
  pubDate: Date;
}

export interface RssChannel {
  title: string;
  /** absolute URL of the section the feed covers (e.g. /blog/) */
  link: string;
  description: string;
  /** BCP-47 language tag, e.g. "en-US" */
  language: string;
}

/** Render one escaped RSS `<item>`. */
export function renderRssItem(item: RssItem): string {
  return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
    </item>`;
}

/** Render the full escaped RSS 2.0 document from channel metadata + items. */
export function renderRssFeed(channel: RssChannel, items: readonly RssItem[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>${channel.language}</language>
${items.map(renderRssItem).join("\n")}
  </channel>
</rss>`;
}
