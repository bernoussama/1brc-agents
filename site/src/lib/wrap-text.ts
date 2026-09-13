/** Greedy word wrap for SVG axis labels (approximate width via char count). */
export function wrapText(text: string, maxChars: number): string[] {
  if (maxChars < 1 || text.length <= maxChars) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines.length > 0 ? lines : [text];
}

/** Approximate monospace glyph width at 10px (matches dither-kit XAxis). */
export const MONO_10PX_CHAR_WIDTH = 6;

export function maxCharsForWidth(widthPx: number): number {
  return Math.max(4, Math.floor(widthPx / MONO_10PX_CHAR_WIDTH));
}
