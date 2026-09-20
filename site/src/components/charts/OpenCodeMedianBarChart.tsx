import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Legend } from "@/components/dither-kit/legend";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { YAxis } from "@/components/dither-kit/y-axis";

import { BarValueLabels } from "./BarValueLabels";
import { formatSecondsFromMs, formatYAxisSecondsFromMs } from "./format-seconds";
import { OPENCODE_CHART_BAR_COUNT, OPENCODE_RUNS } from "./opencode-runs";
import { WrappedXAxis } from "./WrappedXAxis";

const data = OPENCODE_RUNS.map(({ model, median }) => ({ model, median }));

const config = {
  median: { label: "median_s", color: "blue" as const },
};

/**
 * Dithered bar chart of native OpenCode 2 Round A medians.
 * Mount with `client:load` from MDX/Astro.
 */
export default function OpenCodeMedianBarChart() {
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
          <WrappedXAxis dataKey="model" maxTicks={OPENCODE_CHART_BAR_COUNT} tickMargin={6} />
          <YAxis tickFormatter={formatYAxisSecondsFromMs} />
          <Legend />
          <Tooltip labelKey="model" valueFormatter={formatSecondsFromMs} />
          <Bar dataKey="median" variant="gradient" />
          <BarValueLabels dataKey="median" valueFormatter={formatSecondsFromMs} />
        </BarChart>
      </div>
      <figcaption className="font-mono text-muted-foreground text-xs leading-relaxed">
        OpenCode 2 cloud-agent Round A — median of five timed runs (seconds). Lower is faster. Native
        OpenCode 2 CLI, not the pi dashboard. Not comparable to laptop v0.5 or to pi cloud-agent
        medians.
      </figcaption>
    </figure>
  );
}
