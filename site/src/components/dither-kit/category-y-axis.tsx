import { maxCharsForWidth, wrapText } from "@/lib/wrap-text"
import { useChartPart } from "./chart-context"

/** Category labels along the left for horizontal bar charts. */
export function CategoryYAxis({
  dataKey,
  tickMargin = 8,
  maxTicks,
  lineHeight = 11,
}: {
  dataKey?: string
  tickMargin?: number
  maxTicks?: number
  lineHeight?: number
}) {
  const ctx = useChartPart("CategoryYAxis", "bar")
  if (!ctx.ready) return null

  const step = Math.max(1, Math.ceil(ctx.dataLength / (maxTicks ?? ctx.dataLength)))
  const maxChars = Math.max(
    8,
    maxCharsForWidth(Math.max(48, ctx.margins.left - tickMargin))
  )

  return (
    <g className="fill-current font-mono text-[10px] text-muted-foreground">
      {ctx.data.map((row, i) => {
        if (i % step !== 0) return null
        const raw = dataKey ? row[dataKey] : i
        const label = String(raw ?? "")
        const lines = wrapText(label, maxChars)
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
