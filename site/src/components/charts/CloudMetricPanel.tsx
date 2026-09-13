import type { ReactNode } from "react";
import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import type { BloomInput } from "@/components/dither-kit/dither-paint";
import { Grid } from "@/components/dither-kit/grid";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { YAxis } from "@/components/dither-kit/y-axis";
import type { DitherColor } from "@/components/dither-kit/palette";
import type { AreaVariant } from "@/components/dither-kit/chart-context";
import { BarValueLabels } from "./BarValueLabels";
import { NaAwareBarValueLabels } from "./NaAwareBarValueLabels";
import { NaAwareMetricTooltip } from "./NaAwareMetricTooltip";
import { CLOUD_CHART_BAR_COUNT } from "./cloud-agent-runs";
import { WrappedXAxis } from "./WrappedXAxis";

type PanelRow = Record<string, unknown>;

export type CloudMetricPanelProps = {
  title: string;
  hint: string;
  dataKey: string;
  seriesLabel: string;
  color: DitherColor;
  data: PanelRow[];
  valueFormatter: (value: number) => string;
  yAxisFormatter: (value: number) => string;
  naAware?: boolean;
  bloom?: BloomInput;
  barVariant?: AreaVariant;
  replayToken?: number;
  animationDuration?: number;
};

function MetricTooltip({
  naAware,
  labelKey,
  valueKey,
  valueFormatter,
}: {
  naAware: boolean;
  labelKey: string;
  valueKey: string;
  valueFormatter: (value: number) => string;
}): ReactNode {
  if (naAware) {
    return (
      <NaAwareMetricTooltip
        labelKey={labelKey}
        valueKey={valueKey}
        valueFormatter={valueFormatter}
      />
    );
  }

  return <Tooltip labelKey={labelKey} valueFormatter={valueFormatter} />;
}

function MetricValueLabels({
  naAware,
  dataKey,
  valueFormatter,
}: {
  naAware: boolean;
  dataKey: string;
  valueFormatter: (value: number) => string;
}): ReactNode {
  if (naAware) {
    return <NaAwareBarValueLabels dataKey={dataKey} valueFormatter={valueFormatter} />;
  }

  return <BarValueLabels dataKey={dataKey} valueFormatter={valueFormatter} />;
}

/** Compact single-metric bar chart for dashboard panels. */
export function CloudMetricPanel({
  title,
  hint,
  dataKey,
  seriesLabel,
  color,
  data,
  valueFormatter,
  yAxisFormatter,
  naAware = false,
  bloom = "low",
  barVariant = "gradient",
  replayToken = 0,
  animationDuration,
}: CloudMetricPanelProps) {
  const config = {
    [dataKey]: { label: seriesLabel, color },
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="text-center">
        <h2 className="font-mono text-sm font-semibold text-foreground sm:text-base">{title}</h2>
        <p className="font-mono text-[11px] text-muted-foreground italic">{hint}</p>
      </div>
      <div className="border-foreground bg-card h-96 w-full min-w-64 border-2 border-solid p-2">
        <BarChart
          data={data}
          config={config}
          bloom={bloom}
          animate
          replayToken={replayToken}
          animationDuration={animationDuration}
          margins={{ top: 28, bottom: 72, left: 40, right: 8 }}
        >
          <Grid horizontal />
          <WrappedXAxis dataKey="model" maxTicks={CLOUD_CHART_BAR_COUNT} tickMargin={4} lineHeight={10} />
          <YAxis tickFormatter={yAxisFormatter} tickCount={4} />
          <MetricTooltip
            naAware={naAware}
            labelKey="model"
            valueKey={dataKey}
            valueFormatter={valueFormatter}
          />
          <Bar dataKey={dataKey} variant={barVariant} />
          <MetricValueLabels
            naAware={naAware}
            dataKey={dataKey}
            valueFormatter={valueFormatter}
          />
        </BarChart>
      </div>
    </div>
  );
}
