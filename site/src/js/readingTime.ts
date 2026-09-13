/**
 * Estimated read time in whole minutes for a body of prose, at ~200 words/minute (floored at 1).
 * Fed the raw MDX body (`entry.body`) so it needs no rendered HTML — a rough word count over
 * whitespace is plenty for the "N MIN READ" byline; the markdown syntax it counts is negligible.
 *
 * @param body raw markdown/MDX body string
 * @returns read-time in minutes, minimum 1
 * @example readingTime(entry.body); // 5
 */
export function readingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
