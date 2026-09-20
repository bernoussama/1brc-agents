import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Legend } from "@/components/dither-kit/legend";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { YAxis } from "@/components/dither-kit/y-axis";

import { BarValueLabels } from "./BarValueLabels";
import {
  formatMinutesFromSeconds,
  formatYAxisMinutesFromSeconds,
} from "./format-minutes";
import { OPENCODE_CHART_BAR_COUNT, OPENCODE_RUNS } from "./opencode-runs";
import { WrappedXAxis } from "./WrappedXAxis";

const data = OPENCODE_RUNS.map(({ model, agentSeconds }) => ({
  model,
  agentSeconds,
}));

const config = {
  agentSeconds: { label: "agent_time_m", color: "orange" as const },
};

/** Agent wall-clock time per native OpenCode 2 configuration. Mount with `client:load`. */
export default function OpenCodeAgentTimeBarChart() {
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
          <WrappedXAxis dataKey="model" maxTicks={OPENCODE_CHART_BAR_COUNT} tickMargin={6} />
          <YAxis tickFormatter={formatYAxisMinutesFromSeconds} />
          <Legend />
          <Tooltip labelKey="model" valueFormatter={formatMinutesFromSeconds} />
          <Bar dataKey="agentSeconds" variant="hatched" />
          <BarValueLabels dataKey="agentSeconds" valueFormatter={formatMinutesFromSeconds} />
        </BarChart>
      </div>
      <figcaption className="font-mono text-muted-foreground text-xs leading-relaxed">
        Agent wall time until the harness scored the submission (minutes). Budget cap was 120m. Solo
        Sol-high OpenCode 2 finished just under the cap; the conductor session hit the deadline after
        a correct submission existed.
      </figcaption>
    </figure>
  );
}
