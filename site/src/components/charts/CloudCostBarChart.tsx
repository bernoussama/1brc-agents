import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Legend } from "@/components/dither-kit/legend";
import { YAxis } from "@/components/dither-kit/y-axis";
import {
  CLOUD_AGENT_RUNS,
  CLOUD_CHART_BAR_COUNT,
  cloudMetricBarValue,
} from "./cloud-agent-runs";
import { NaAwareBarValueLabels } from "./NaAwareBarValueLabels";
import { NaAwareMetricTooltip } from "./NaAwareMetricTooltip";
import { formatUsd, formatUsdDetailed, formatYAxisUsd } from "./format-usd";
import { WrappedXAxis } from "./WrappedXAxis";

const data = CLOUD_AGENT_RUNS.map((run) => ({
  model: run.model,
  costUsd: cloudMetricBarValue(run, "costUsd"),
  metricsAvailable: run.metricsAvailable,
}));

const config = {
  costUsd: { label: "est_cost_usd", color: "green" as const },
};

/** Estimated list-rate USD cost per cloud-agent run. Mount with `client:load`. */
export default function CloudCostBarChart() {
  return (
    <figure className="not-prose my-6 flex flex-col gap-3">
      <div className="border-foreground bg-card h-96 w-full border-2 border-solid p-2 sm:h-[28rem]">
        <BarChart
          data={data}
          config={config}
          bloom="low"
          animate
          margins={{ top: 36, bottom: 88 }}
        >
          <WrappedXAxis dataKey="model" maxTicks={CLOUD_CHART_BAR_COUNT} tickMargin={6} />
          <YAxis tickFormatter={formatYAxisUsd} />
          <Legend />
          <NaAwareMetricTooltip
            labelKey="model"
            valueKey="costUsd"
            valueFormatter={formatUsdDetailed}
          />
          <Bar dataKey="costUsd" variant="hatched" />
          <NaAwareBarValueLabels dataKey="costUsd" valueFormatter={formatUsd} />
        </BarChart>
      </div>
      <figcaption className="font-mono text-muted-foreground text-xs leading-relaxed">
        Estimated USD from published input, output, and cache-read rates (see scripts/model_pricing.json).
        Codex rows cross-check against session event costs; free-preview routes (ox-alpha, Muse, M3 :free)
        use list rates even when billed at $0. Cursor Grok rows are N/A.
      </figcaption>
    </figure>
  );
}
