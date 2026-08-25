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
  if (!ctx.ready || !band) return null;

  const format = (value: number) =>
    valueFormatter ? valueFormatter(value) : value.toLocaleString();

  const minLabelY = 12;

  return (
    <g className="fill-current font-mono text-[9px] text-foreground tabular-nums sm:text-[10px]">
      {band.map((b, i) => {
        const value = b[1];
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
