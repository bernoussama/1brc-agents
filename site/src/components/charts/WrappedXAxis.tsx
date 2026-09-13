import { useChartPart } from "@/components/dither-kit/chart-context";
import { maxCharsForWidth, wrapText } from "@/lib/wrap-text";

export function WrappedXAxis({
  dataKey,
  tickMargin = 8,
  maxTicks = 8,
  lineHeight = 12,
}: {
  dataKey?: string;
  tickMargin?: number;
  maxTicks?: number;
  lineHeight?: number;
}) {
  const ctx = useChartPart("WrappedXAxis");
  if (!ctx.ready) return null;

  const step = Math.max(1, Math.ceil(ctx.dataLength / maxTicks));
  const y = ctx.plot.height + tickMargin;
  const maxChars = maxCharsForWidth(ctx.bandwidth * 0.92);

  return (
    <g className="fill-current font-mono text-[10px] text-muted-foreground">
      {ctx.data.map((row, i) => {
        if (i % step !== 0) return null;
        const raw = dataKey ? row[dataKey] : i;
        const label = String(raw ?? "");
        const lines = wrapText(label, maxChars);
        const x = ctx.xCenter(i) ?? 0;

        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable x position
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="hanging"
            fill="currentColor"
          >
            {lines.map((line, lineIndex) => (
              <tspan
                // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable per tick
                key={lineIndex}
                x={x}
                dy={lineIndex === 0 ? 0 : lineHeight}
              >
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </g>
  );
}
