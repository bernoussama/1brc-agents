/**
 * * Nav helpers.
 */

/**
 * Whether a nav link's `href` is the current location — drives `aria-current="page"` and the
 * header's active state (green label + ► pointer). Both paths are normalized to the site's
 * trailing-slash shape (`astro.config.mjs` `trailingSlash: "always"`), so `/about` and `/about/`
 * match alike. A non-home link also matches its descendants (`/blog/my-post/` activates `Blog`);
 * home (`/`) matches only itself, never as a prefix of everything.
 *
 * @param pathname current URL path — pass `Astro.url.pathname`
 * @param href the link's target, e.g. `/about/`
 * @returns true when the link represents the current page
 * @example isActive("/blog/hello/", "/blog/"); // true
 */
export function isActive(pathname: string, href: string): boolean {
  const withSlash = (p: string): string => (p.endsWith("/") ? p : `${p}/`);
  const path = withSlash(pathname);
  const target = withSlash(href);
  if (target === "/") return path === "/";
  return path === target || path.startsWith(target);
}
