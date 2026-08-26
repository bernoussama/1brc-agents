import { useChartPart } from "./chart-context"

export function Grid({
  horizontal = true,
  vertical = false,
  strokeDasharray = "3 3",
}: {
  horizontal?: boolean
  vertical?: boolean
  strokeDasharray?: string
}) {
  const ctx = useChartPart("Grid")
  if (!ctx.ready) return null
  const { width, height } = ctx.plot
  const valueOnX = ctx.layout === "horizontal"

  return (
    <g className="stroke-border" strokeDasharray={strokeDasharray}>
      {horizontal &&
        (valueOnX
          ? // Horizontal bars: "horizontal" still means value gridlines — drawn vertical.
            ctx.y.ticks(4).map((t) => (
              <line
                key={`v-val-${t}`}
                x1={ctx.y(t)}
                x2={ctx.y(t)}
                y1={0}
                y2={height}
              />
            ))
          : ctx.y.ticks(4).map((t) => (
              <line
                key={`h-${t}`}
                x1={0}
                x2={width}
                y1={ctx.y(t)}
                y2={ctx.y(t)}
              />
            )))}
      {vertical &&
        !valueOnX &&
        ctx.data.map((_, i) => (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable x position
            key={`v-${i}`}
            x1={ctx.xCenter(i) ?? 0}
            x2={ctx.xCenter(i) ?? 0}
            y1={0}
            y2={height}
          />
        ))}
    </g>
  )
}

// Render beneath the dither canvas so grid lines sit behind the fill.
Grid.chartLayer = "back" as const
