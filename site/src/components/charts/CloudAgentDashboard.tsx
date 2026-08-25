import { useEffect, useState } from "react";
import {
  CLOUD_AGENT_RUNS,
  cloudMetricBarValue,
} from "./cloud-agent-runs";
import { CloudMetricPanel } from "./CloudMetricPanel";
import {
  formatMinutesFromSeconds,
  formatYAxisMinutesFromSeconds,
} from "./format-minutes";
import { formatSecondsFromMs, formatYAxisSecondsFromMs } from "./format-seconds";
import { formatUsd, formatYAxisUsd } from "./format-usd";

const medianData = CLOUD_AGENT_RUNS.map(({ model, median }) => ({ model, median }));

const agentTimeData = CLOUD_AGENT_RUNS.map(({ model, agentSeconds }) => ({
  model,
  agentSeconds,
}));

const costData = CLOUD_AGENT_RUNS.map((run) => ({
  model: run.model,
  costUsd: cloudMetricBarValue(run, "costUsd"),
  metricsAvailable: run.metricsAvailable,
}));

function readCaptureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("capture");
}

/** Three-up dashboard: median, agent wall time, estimated cost. Mount with `client:load`. */
export default function CloudAgentDashboard() {
  const [replayToken, setReplayToken] = useState(0);
  const captureMode = readCaptureMode();

  useEffect(() => {
    const win = window as Window & { __replayDashboardCharts?: () => void };
    win.__replayDashboardCharts = () => {
      setReplayToken((token) => token + 1);
    };
    return () => {
      delete win.__replayDashboardCharts;
    };
  }, []);

  const animationDuration = captureMode ? 3000 : undefined;

  return (
    <div className="not-prose flex flex-col gap-8">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="font-mono text-xl font-semibold text-foreground sm:text-2xl">
          Cloud-agent Round A — scored configurations
        </h1>
        <p className="font-mono text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Xeon 4 CPU / 16 GiB · 120m budget · Codex OAuth · OpenRouter · GMI Serving · OpenCode Zen
          free · Cursor proxy
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3 xl:gap-4">
        <CloudMetricPanel
          title="Median run time"
          hint="*lower is better*"
          dataKey="median"
          seriesLabel="median_s"
          color="blue"
          data={medianData}
          valueFormatter={formatSecondsFromMs}
          yAxisFormatter={formatYAxisSecondsFromMs}
          bloom="aura"
          barVariant="gradient"
          replayToken={replayToken}
          animationDuration={animationDuration}
        />
        <CloudMetricPanel
          title="Agent wall time"
          hint="*lower is better*"
          dataKey="agentSeconds"
          seriesLabel="agent_time_m"
          color="orange"
          data={agentTimeData}
          valueFormatter={formatMinutesFromSeconds}
          yAxisFormatter={formatYAxisMinutesFromSeconds}
          bloom="low"
          barVariant="hatched"
          replayToken={replayToken}
          animationDuration={animationDuration}
        />
        <CloudMetricPanel
          title="Estimated cost"
          hint="*lower is better*"
          dataKey="costUsd"
          seriesLabel="est_cost_usd"
          color="green"
          data={costData}
          valueFormatter={formatUsd}
          yAxisFormatter={formatYAxisUsd}
          naAware
          bloom="low"
          barVariant="hatched"
          replayToken={replayToken}
          animationDuration={animationDuration}
        />
      </div>

      <footer className="font-mono text-[10px] text-muted-foreground sm:text-xs">
        <p className="text-right">
          Source: 1BRC-Agents cloud-agent sessions · cost from{" "}
          <code className="text-foreground">scripts/model_pricing.json</code>
        </p>
        <p className="mt-2 leading-relaxed">
          Median is warm-cache processing time on the held-out billion-row file (seconds). Agent wall
          time is harness clock until scoring (minutes). Cost uses published input, output, and
          cache-read list rates; Cursor Grok rows are N/A. Not comparable to laptop v0.5 medians.
        </p>
      </footer>
    </div>
  );
}
