/** Greedy word wrap for SVG axis labels (approximate width via char count). */
export function wrapText(text: string, maxChars: number): string[] {
  if (maxChars < 1 || text.length <= maxChars) return [text]

  // Split on whitespace and soft-break punctuation so long model labels wrap
  // cleanly (e.g. "MiniMax M3 :free max", "Muse Spark free xhigh (r2)").
  const tokens = text.split(/(\s+|:(?=\S)|\/)/).filter((t) => t.length > 0)
  const lines: string[] = []
  let line = ""

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      // defer whitespace — only keep it when joining non-empty pieces
      continue
    }
    const joiner = line && !line.endsWith(":") && !token.startsWith(":") ? " " : ""
    const candidate = line ? `${line}${joiner}${token}` : token
    if (candidate.length > maxChars && line) {
      lines.push(line)
      line = token
    } else {
      line = candidate
    }
  }

  if (line) lines.push(line)

  // Hard-break any leftover token longer than maxChars.
  const out: string[] = []
  for (const piece of lines.length > 0 ? lines : [text]) {
    if (piece.length <= maxChars) {
      out.push(piece)
      continue
    }
    for (let i = 0; i < piece.length; i += maxChars) {
      out.push(piece.slice(i, i + maxChars))
    }
  }
  return out.length > 0 ? out : [text]
}

/** Approximate monospace glyph width at 10px (matches dither-kit XAxis). */
export const MONO_10PX_CHAR_WIDTH = 6;

export function maxCharsForWidth(widthPx: number): number {
  return Math.max(4, Math.floor(widthPx / MONO_10PX_CHAR_WIDTH));
}
