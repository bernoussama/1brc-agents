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

  return (
    <g
      className="fill-foreground font-mono text-[9px] tabular-nums sm:text-[10px]"
      style={{
        opacity: ctx.entranceDone ? 1 : 0,
        transition: "opacity 300ms ease",
      }}
    >
      {band.map((b, i) => {
        const value = b[1];
        const x = ctx.xCenter(i) ?? 0;
        const y = ctx.y(value) - offset;

        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable x position
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="auto"
            fill="currentColor"
          >
            {format(value)}
          </text>
        );
      })}
    </g>
  );
}
