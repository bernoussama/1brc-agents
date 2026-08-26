import { useChartPart } from "@/components/dither-kit/chart-context";

export function BarValueLabels({
  dataKey,
  valueFormatter,
  offset = 5,
}: {
  dataKey: string;
  valueFormatter?: (value: number) => string;
}) {
  const ctx = useChartPart("BarValueLabels", "bar");
  const band = ctx.bands[dataKey];
  if (!ctx.ready || !band || !ctx.entranceDone) return null;

  const format = (value: number) =>
    valueFormatter ? valueFormatter(value) : value.toLocaleString();

  const minLabelY = 12;
  const horizontal = ctx.layout === "horizontal";

  return (
    <g className="fill-current font-mono text-[9px] text-foreground tabular-nums sm:text-[10px]">
      {band.map((b, i) => {
        const value = b[1];
        if (horizontal) {
          const tip = ctx.y(value);
          const y = ctx.xCenter(i) ?? 0;
          return (
            <text
              // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable category position
              key={i}
              x={tip + offset}
              y={y}
              textAnchor="start"
              dominantBaseline="central"
              fill="currentColor"
            >
              {format(value)}
            </text>
          );
        }

        const x = ctx.xCenter(i) ?? 0;
        const barTop = ctx.y(value);
        const y = Math.max(minLabelY, barTop - offset);

        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable x position
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="text-bottom"
            fill="currentColor"
          >
            {format(value)}
          </text>
        );
      })}
    </g>
  );
}
