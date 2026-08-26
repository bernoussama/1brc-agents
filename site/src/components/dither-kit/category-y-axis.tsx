import { wrapText } from "@/lib/wrap-text"
import { useChartPart } from "./chart-context"

/** Category labels along the left for horizontal bar charts. */
export function CategoryYAxis({
  dataKey,
  tickMargin = 8,
  maxTicks,
  lineHeight = 13,
  maxLines = 2,
}: {
  dataKey?: string
  tickMargin?: number
  maxTicks?: number
  lineHeight?: number
  maxLines?: number
}) {
  const ctx = useChartPart("CategoryYAxis", "bar")
  if (!ctx.ready) return null

  const step = Math.max(1, Math.ceil(ctx.dataLength / (maxTicks ?? ctx.dataLength)))
  // Leave a few px of breathing room inside the left margin so glyphs don't
  // kiss the SVG edge (mono width is approximate at 12px ≈ 8px/glyph).
  const labelBudget = Math.max(40, ctx.margins.left - tickMargin - 12)
  const maxChars = Math.max(8, Math.floor(labelBudget / 8))

  return (
    <g className="fill-current font-mono text-[12px] text-muted-foreground">
      {ctx.data.map((row, i) => {
        if (i % step !== 0) return null
        const raw = dataKey ? row[dataKey] : i
        const label = String(raw ?? "")
        const lines = fitLines(wrapText(label, maxChars), maxLines, maxChars)
        const y = ctx.xCenter(i) ?? 0
        const startY = y - ((lines.length - 1) * lineHeight) / 2

        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable category position
            key={i}
            x={-tickMargin}
            y={startY}
            textAnchor="end"
            dominantBaseline="central"
            fill="currentColor"
          >
            {lines.map((line, lineIndex) => (
              <tspan
                // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable per tick
                key={lineIndex}
                x={-tickMargin}
                dy={lineIndex === 0 ? 0 : lineHeight}
              >
                {line}
              </tspan>
            ))}
          </text>
        )
      })}
    </g>
  )
}

/** Cap wrapped lines and ellipsize the last line when the label is too long. */
function fitLines(lines: string[], maxLines: number, maxChars: number): string[] {
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1] ?? ""
  const room = Math.max(1, maxChars - 1)
  kept[maxLines - 1] = `${last.slice(0, room).trimEnd()}…`
  return kept
}
