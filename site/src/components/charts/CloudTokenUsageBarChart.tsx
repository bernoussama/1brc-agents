import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Legend } from "@/components/dither-kit/legend";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { YAxis } from "@/components/dither-kit/y-axis";
import { BarValueLabels } from "./BarValueLabels";
import { CLOUD_AGENT_RUNS, CLOUD_CHART_BAR_COUNT } from "./cloud-agent-runs";
import { formatTokenCount, formatTokenCountDetailed } from "./format-tokens";
import { WrappedXAxis } from "./WrappedXAxis";

const data = CLOUD_AGENT_RUNS.map(({ model, tokens }) => ({
  model,
  tokens,
}));

const config = {
  tokens: { label: "tokens", color: "purple" as const },
};

/** Total model tokens per cloud-agent configuration. Mount with `client:load`. */
export default function CloudTokenUsageBarChart() {
  return (
    <figure className="not-prose my-6 flex flex-col gap-3">
      <div className="border-foreground bg-card h-96 w-full border-2 border-solid p-2 sm:h-[28rem]">
        <BarChart
          data={data}
          config={config}
          bloom="aura"
          animate
          margins={{ top: 36, bottom: 88 }}
        >
          <WrappedXAxis dataKey="model" maxTicks={CLOUD_CHART_BAR_COUNT} tickMargin={6} />
          <YAxis tickFormatter={formatTokenCount} />
          <Legend />
          <Tooltip labelKey="model" valueFormatter={formatTokenCountDetailed} />
          <Bar dataKey="tokens" variant="gradient" />
          <BarValueLabels dataKey="tokens" valueFormatter={formatTokenCount} />
        </BarChart>
      </div>
      <figcaption className="font-mono text-muted-foreground text-xs leading-relaxed">
        Sum of assistant `totalTokens` per turn from each session log. Counts include cache-read
        tokens where the provider reports them. Cursor Grok rows under-report through the in-container
        proxy; cross-provider totals are not normalized for cost.
      </figcaption>
    </figure>
  );
}
