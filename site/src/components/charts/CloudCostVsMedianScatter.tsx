import { scaleLinear } from "d3-scale";
import { useEffect, useMemo, useState } from "react";
import { rgb, seedOfColor } from "@/components/dither-kit/palette";
import { useChartDimensions } from "@/components/dither-kit/use-chart-dimensions";
import { CLOUD_AGENT_RUNS, type CloudAgentRun } from "./cloud-agent-runs";
import { formatSecondsFromMs, formatYAxisSecondsFromMs } from "./format-seconds";
import { formatUsd, formatYAxisUsd } from "./format-usd";

type CostPoint = {
  model: string;
  median: number;
  costUsd: number;
};

type PlacedLabel = {
  model: string;
  x: number;
  y: number;
  textX: number;
  textY: number;
  anchor: "start" | "end";
};

const MARGINS = { top: 28, right: 140, bottom: 48, left: 56 };
const POINT_R = 5;
const LABEL_GAP = 10;
const LABEL_LINE = 13;
const TICK_COUNT = 5;

function withCost(run: CloudAgentRun): run is CloudAgentRun & { costUsd: number } {
  return run.metricsAvailable && run.costUsd != null;
}

function buildPoints(): CostPoint[] {
  return CLOUD_AGENT_RUNS.filter(withCost).map((run) => ({
    model: run.model,
    median: run.median,
    costUsd: run.costUsd,
  }));
}

/** Greedy label placement: prefer right of the point, flip/nudge to reduce overlap. */
function placeLabels(
  points: CostPoint[],
  xOf: (v: number) => number,
  yOf: (v: number) => number,
  plotWidth: number,
  plotHeight: number,
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const roughWidth = (label: string) => Math.min(label.length * 7.2, 168);

  for (const point of points) {
    const x = xOf(point.median);
    const y = yOf(point.costUsd);
    const preferRight = x < plotWidth * 0.62;
    let anchor: "start" | "end" = preferRight ? "start" : "end";
    let textX = preferRight ? x + LABEL_GAP : x - LABEL_GAP;
    let textY = y - 2;

    // Keep labels inside the plot + right margin band.
    if (anchor === "start" && textX + roughWidth(point.model) > plotWidth + MARGINS.right - 8) {
      anchor = "end";
      textX = x - LABEL_GAP;
    }
    if (anchor === "end" && textX - roughWidth(point.model) < -MARGINS.left + 4) {
      anchor = "start";
      textX = x + LABEL_GAP;
    }
    textY = Math.max(LABEL_LINE, Math.min(plotHeight - 2, textY));

    // Nudge vertically away from already-placed labels with similar x.
    for (let attempt = 0; attempt < 8; attempt++) {
      const conflict = placed.some((other) => {
        const sameSide = other.anchor === anchor;
        const dx = Math.abs(other.textX - textX);
        const dy = Math.abs(other.textY - textY);
        const widthBudget = Math.max(roughWidth(other.model), roughWidth(point.model)) * 0.55;
        return sameSide && dx < widthBudget && dy < LABEL_LINE;
      });
      if (!conflict) break;
      textY += attempt % 2 === 0 ? LABEL_LINE : -LABEL_LINE;
      textY = Math.max(LABEL_LINE, Math.min(plotHeight - 2, textY));
    }

    placed.push({ model: point.model, x, y, textX, textY, anchor });
  }

  return placed;
}

export type CloudCostVsMedianScatterProps = {
  replayToken?: number;
  animationDuration?: number;
};

/** Labeled scatter: estimated cost (Y) vs median run time (X) by model. */
export function CloudCostVsMedianScatter({
  replayToken = 0,
  animationDuration = 900,
}: CloudCostVsMedianScatterProps) {
  const { ref, size } = useChartDimensions<HTMLDivElement>();
  const [entranceDone, setEntranceDone] = useState(!animationDuration);
  const points = useMemo(() => buildPoints(), []);
  const seed = seedOfColor("blue");

  useEffect(() => {
    if (!animationDuration) {
      setEntranceDone(true);
      return;
    }
    setEntranceDone(false);
    const id = window.setTimeout(() => setEntranceDone(true), animationDuration);
    return () => window.clearTimeout(id);
  }, [animationDuration, replayToken]);

  const plotWidth = Math.max(0, size.width - MARGINS.left - MARGINS.right);
  const plotHeight = Math.max(0, size.height - MARGINS.top - MARGINS.bottom);
  const ready = plotWidth > 0 && plotHeight > 0;

  const xMax = Math.max(...points.map((p) => p.median), 1);
  const yMax = Math.max(...points.map((p) => p.costUsd), 1);

  const xScale = scaleLinear()
    .domain([0, xMax])
    .nice()
    .range([0, plotWidth]);
  const yScale = scaleLinear()
    .domain([0, yMax])
    .nice()
    .range([plotHeight, 0]);

  const labels = ready
    ? placeLabels(points, (v) => xScale(v), (v) => yScale(v), plotWidth, plotHeight)
    : [];

  const xTicks = ready ? xScale.ticks(TICK_COUNT) : [];
  const yTicks = ready ? yScale.ticks(TICK_COUNT) : [];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="text-center">
        <h2 className="font-mono text-sm font-semibold text-foreground sm:text-base">
          Cost vs median run time
        </h2>
        <p className="font-mono text-[11px] text-muted-foreground italic">
          *each point is a scored model · Grok omitted (cost N/A)*
        </p>
      </div>
      <div className="border-foreground bg-card h-[28rem] w-full min-w-64 border-2 border-solid p-2">
        <div ref={ref} className="relative h-full w-full">
          {ready ? (
            <svg
              width={size.width}
              height={size.height}
              className="absolute inset-0 overflow-visible"
              role="img"
              aria-label="Labeled point chart of estimated cost versus median run time by model"
            >
              <g transform={`translate(${MARGINS.left},${MARGINS.top})`}>
                <g className="stroke-border" strokeDasharray="3 3">
                  {yTicks.map((t) => (
                    <line key={`hy-${t}`} x1={0} x2={plotWidth} y1={yScale(t)} y2={yScale(t)} />
                  ))}
                  {xTicks.map((t) => (
                    <line key={`vx-${t}`} x1={xScale(t)} x2={xScale(t)} y1={0} y2={plotHeight} />
                  ))}
                </g>

                <g className="fill-current font-mono text-[11px] text-muted-foreground">
                  {yTicks.map((t) => (
                    <text
                      key={`yt-${t}`}
                      x={-10}
                      y={yScale(t)}
                      textAnchor="end"
                      dominantBaseline="central"
                      fill="currentColor"
                    >
                      {formatYAxisUsd(t)}
                    </text>
                  ))}
                  {xTicks.map((t) => (
                    <text
                      key={`xt-${t}`}
                      x={xScale(t)}
                      y={plotHeight + 12}
                      textAnchor="middle"
                      dominantBaseline="hanging"
                      fill="currentColor"
                    >
                      {formatYAxisSecondsFromMs(t)}
                    </text>
                  ))}
                  <text
                    x={plotWidth / 2}
                    y={plotHeight + 32}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-[10px]"
                  >
                    median run time
                  </text>
                  <text
                    transform={`translate(${-42},${plotHeight / 2}) rotate(-90)`}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-[10px]"
                  >
                    estimated cost
                  </text>
                </g>

                <g
                  style={{
                    opacity: entranceDone ? 1 : 0,
                    transition: `opacity ${Math.min(400, animationDuration)}ms ease`,
                  }}
                >
                  {labels.map((label, i) => {
                    const point = points[i];
                    const title = `${point.model}: ${formatSecondsFromMs(point.median)}, ${formatUsd(point.costUsd)}`;
                    return (
                      <g key={label.model}>
                        <title>{title}</title>
                        <circle
                          cx={label.x}
                          cy={label.y}
                          r={POINT_R}
                          fill={rgb(seed.fill, 1, 0.35)}
                          stroke={rgb(seed.line)}
                          strokeWidth={1.5}
                        />
                        <text
                          x={label.textX}
                          y={label.textY}
                          textAnchor={label.anchor}
                          dominantBaseline="central"
                          fill="currentColor"
                          className="fill-current font-mono text-[11px] text-foreground"
                        >
                          {label.model}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default CloudCostVsMedianScatter;
