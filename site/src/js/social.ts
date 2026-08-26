/**
 * * Resolve a social/profile URL from the site's `sameAs` list.
 *
 * Returns the first `sameAs` entry whose URL contains any of `hosts`, else `fallback`. Keeps the
 * `find … ?? fallback` derivation in one canonical place so the header/footer/contact sections don't
 * each re-implement it.
 *
 * @param sameAs   the site's social/profile URLs (`siteData.sameAs`); may be undefined/empty
 * @param hosts    host substring(s) to match, e.g. `"github.com"` or `["x.com", "twitter.com"]`
 * @param fallback URL to use when nothing matches
 * @returns the matched profile URL, or `fallback`
 * @example socialUrl(siteData.sameAs, "linkedin.com", "https://www.linkedin.com/")
 */
export function socialUrl(
  sameAs: readonly string[] | undefined,
  hosts: string | readonly string[],
  fallback: string,
): string {
  const list = typeof hosts === "string" ? [hosts] : hosts;
  return sameAs?.find((url) => list.some((host) => url.includes(host))) ?? fallback;
}
