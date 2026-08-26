import { useChartPart } from "@/components/dither-kit/chart-context";

export function NaAwareBarValueLabels({
  dataKey,
  availableKey = "metricsAvailable",
  valueFormatter,
  offset = 5,
}: {
  dataKey: string;
  availableKey?: string;
  valueFormatter?: (value: number) => string;
  offset?: number;
}) {
  const ctx = useChartPart("NaAwareBarValueLabels", "bar");
  const band = ctx.bands[dataKey];
  if (!ctx.ready || !band || !ctx.entranceDone) return null;

  const format = (value: number) =>
    valueFormatter ? valueFormatter(value) : value.toLocaleString();

  const minLabelY = 12;
  const horizontal = ctx.layout === "horizontal";

  return (
    <g className="fill-current font-mono text-[9px] text-foreground tabular-nums sm:text-[10px]">
      {band.map((b, i) => {
        const row = ctx.data[i] ?? {};
        const available = row[availableKey] !== false;
        const rawValue = row[dataKey];
        const value = typeof rawValue === "number" ? rawValue : 0;
        const label = available ? format(value) : "N/A";

        if (horizontal) {
          const tip = ctx.y(b[1]);
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
              {label}
            </text>
          );
        }

        const x = ctx.xCenter(i) ?? 0;
        const barTop = ctx.y(b[1]);
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
            {label}
          </text>
        );
      })}
    </g>
  );
}
