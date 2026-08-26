import { useChartPart } from "./chart-context"

/** Value ticks along the bottom for horizontal bar charts. */
export function ValueXAxis({
  tickFormatter,
  tickCount = 4,
  tickMargin = 8,
}: {
  tickFormatter?: (value: number) => string
  tickCount?: number
  tickMargin?: number
}) {
  const ctx = useChartPart("ValueXAxis", "bar")
  if (!ctx.ready) return null

  const y = ctx.plot.height + tickMargin

  return (
    <g className="fill-current font-mono text-[10px] text-muted-foreground">
      {ctx.y.ticks(tickCount).map((t) => (
        <text
          key={t}
          x={ctx.y(t)}
          y={y}
          textAnchor="middle"
          dominantBaseline="hanging"
          fill="currentColor"
        >
          {tickFormatter ? tickFormatter(t) : t}
        </text>
      ))}
    </g>
  )
}
