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
  /** When set, draw a callout from the point into the right label rail. */
  railX: number | null;
};

const MARGINS = { top: 28, right: 188, bottom: 48, left: 56 };
const POINT_R = 5;
const LABEL_GAP = 10;
const LABEL_LINE = 15;
const TICK_COUNT = 5;
/** Models at/above this cost keep an inline label; cheaper ones use the right rail. */
const INLINE_COST_FLOOR = 5;

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

/**
 * High-cost points get inline labels; the dense cheap cluster uses a right-side
 * rail with leader lines so names stay readable.
 */
function placeLabels(
  points: CostPoint[],
  xOf: (v: number) => number,
  yOf: (v: number) => number,
  plotWidth: number,
  plotHeight: number,
): PlacedLabel[] {
  const inline: PlacedLabel[] = [];
  const railCandidates: CostPoint[] = [];

  for (const point of points) {
    const x = xOf(point.median);
    const y = yOf(point.costUsd);
    if (point.costUsd >= INLINE_COST_FLOOR) {
      const preferRight = x < plotWidth * 0.7;
      inline.push({
        model: point.model,
        x,
        y,
        textX: preferRight ? x + LABEL_GAP : x - LABEL_GAP,
        textY: Math.max(LABEL_LINE, y - 2),
        anchor: preferRight ? "start" : "end",
        railX: null,
      });
    } else {
      railCandidates.push(point);
    }
  }

  // Top → bottom by cost so the rail order matches the vertical point order.
  const railSorted = [...railCandidates].sort(
    (a, b) => b.costUsd - a.costUsd || a.median - b.median,
  );
  const railX = plotWidth + 14;
  const textX = railX + 8;
  const needed = Math.max(0, (railSorted.length - 1) * LABEL_LINE);
  const span = Math.max(needed, plotHeight * 0.55);
  const startY = Math.max(LABEL_LINE, (plotHeight - span) / 2);

  const rail: PlacedLabel[] = railSorted.map((point, i) => {
    const x = xOf(point.median);
    const y = yOf(point.costUsd);
    const textY = Math.min(plotHeight - 4, startY + i * (span / Math.max(1, railSorted.length - 1)));
    return {
      model: point.model,
      x,
      y,
      textX,
      textY,
      anchor: "start" as const,
      railX,
    };
  });

  return [...inline, ...rail];
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

  const xScale = scaleLinear().domain([0, xMax]).nice().range([0, plotWidth]);
  const yScale = scaleLinear().domain([0, yMax]).nice().range([plotHeight, 0]);

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
                  {labels.map((label) => {
                    const point = points.find((p) => p.model === label.model);
                    if (!point) return null;
                    const title = `${point.model}: ${formatSecondsFromMs(point.median)}, ${formatUsd(point.costUsd)}`;
                    return (
                      <g key={label.model}>
                        <title>{title}</title>
                        {label.railX != null ? (
                          <path
                            d={`M ${label.x + POINT_R} ${label.y} L ${label.railX} ${label.textY} L ${label.textX - 2} ${label.textY}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1}
                            className="stroke-muted-foreground/50"
                          />
                        ) : null}
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
