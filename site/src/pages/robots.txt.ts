import type { APIRoute } from "astro";

/**
 * Dynamic robots.txt — kept as an endpoint (not a static /public file) so the Sitemap
 * line resolves against `site` in astro.config.mjs and never drifts from the real domain.
 * Prerenders to a static /robots.txt at build.
 */
export const GET: APIRoute = ({ site }) => {
  const lines = ["User-agent: *", "Allow: /"];

  // `site` is undefined only if astro.config.mjs `site` is unset; emit the Sitemap line when we can.
  if (site) lines.push("", `Sitemap: ${new URL("sitemap-index.xml", site).href}`);

  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
