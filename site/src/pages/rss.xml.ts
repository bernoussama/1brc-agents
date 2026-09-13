// Dependency-free RSS 2.0 feed for the blog (a feed ships with the blog route; hand-rolled like
// everything else in <head>, no @astrojs/rss). A static endpoint so its absolute URLs resolve against
// `site` and never drift; linked from the footer, BaseHead, and llms.txt. The escaping + document
// shape live in @js/rss (pure + tested); this endpoint only supplies the posts and the `site` URL.
import siteData from "@config/siteData.json";
import { siteLocale } from "@config/siteSettings.json";
import { getSortedPosts } from "@js/blogData";
import { renderRssFeed } from "@js/rss";
import type { APIContext } from "astro";

export async function GET({ site }: APIContext): Promise<Response> {
  if (!site) {
    throw new Error("`site` must be set in astro.config.mjs for the RSS feed to resolve URLs.");
  }

  const posts = await getSortedPosts();
  const xml = renderRssFeed(
    {
      title: siteData.name,
      link: new URL("/blog/", site).href,
      description: siteData.description,
      language: siteLocale,
    },
    posts.map((post) => ({
      title: post.data.title,
      url: new URL(`/blog/${post.id}/`, site).href,
      description: post.data.description,
      pubDate: post.data.pubDate,
    })),
  );

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
