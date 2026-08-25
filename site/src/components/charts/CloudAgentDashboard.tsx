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

type CapturePanel = "median-run-time" | "agent-wall-time" | "estimated-cost";

function readCapturePanel(): CapturePanel | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("capture")) return null;
  const panel = params.get("panel");
  if (
    panel === "median-run-time" ||
    panel === "agent-wall-time" ||
    panel === "estimated-cost"
  ) {
    return panel;
  }
  return null;
}

/** Three-up dashboard: median, agent wall time, estimated cost. Mount with `client:load`. */
export default function CloudAgentDashboard() {
  const [replayToken, setReplayToken] = useState(0);
  const capturePanel = readCapturePanel();

  useEffect(() => {
    if (!capturePanel) return;
    document.documentElement.classList.add("chart-capture");
    return () => {
      document.documentElement.classList.remove("chart-capture");
    };
  }, [capturePanel]);

  useEffect(() => {
    const win = window as Window & { __replayDashboardCharts?: () => void };
    win.__replayDashboardCharts = () => {
      setReplayToken((token) => token + 1);
    };
    return () => {
      delete win.__replayDashboardCharts;
    };
  }, []);

  const showHeader = !capturePanel;
  const showFooter = !capturePanel;

  const panels = [
    {
      slug: "median-run-time" as const,
      title: "Median run time",
      hint: "*lower is better*",
      dataKey: "median",
      seriesLabel: "median_s",
      color: "blue" as const,
      data: medianData,
      valueFormatter: formatSecondsFromMs,
      yAxisFormatter: formatYAxisSecondsFromMs,
      bloom: "aura" as const,
      barVariant: "gradient" as const,
      naAware: false,
    },
    {
      slug: "agent-wall-time" as const,
      title: "Agent wall time",
      hint: "*lower is better*",
      dataKey: "agentSeconds",
      seriesLabel: "agent_time_m",
      color: "orange" as const,
      data: agentTimeData,
      valueFormatter: formatMinutesFromSeconds,
      yAxisFormatter: formatYAxisMinutesFromSeconds,
      bloom: "low" as const,
      barVariant: "hatched" as const,
      naAware: false,
    },
    {
      slug: "estimated-cost" as const,
      title: "Estimated cost",
      hint: "*lower is better*",
      dataKey: "costUsd",
      seriesLabel: "est_cost_usd",
      color: "green" as const,
      data: costData,
      valueFormatter: formatUsd,
      yAxisFormatter: formatYAxisUsd,
      bloom: "low" as const,
      barVariant: "hatched" as const,
      naAware: true,
    },
  ];

  const visiblePanels = capturePanel
    ? panels.filter((panel) => panel.slug === capturePanel)
    : panels;

  return (
    <div className={capturePanel ? "not-prose flex min-h-screen w-full items-center justify-center p-10" : "not-prose flex flex-col gap-8"}>
      {showHeader ? (
        <header className="flex flex-col gap-2 text-center">
          <h1 className="font-mono text-xl font-semibold text-foreground sm:text-2xl">
            Cloud-agent Round A — scored configurations
          </h1>
          <p className="font-mono text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Xeon 4 CPU / 16 GiB · 120m budget · Codex OAuth · OpenRouter · GMI Serving · OpenCode Zen
            free · Cursor proxy
          </p>
        </header>
      ) : null}

      <div className={capturePanel ? "w-full max-w-[88rem]" : "grid grid-cols-1 gap-8 xl:grid-cols-3 xl:gap-4"}>
        {visiblePanels.map((panel) => (
          <CloudMetricPanel
            key={panel.slug}
            title={panel.title}
            hint={panel.hint}
            dataKey={panel.dataKey}
            seriesLabel={panel.seriesLabel}
            color={panel.color}
            data={panel.data}
            valueFormatter={panel.valueFormatter}
            yAxisFormatter={panel.yAxisFormatter}
            naAware={panel.naAware}
            bloom={panel.bloom}
            barVariant={panel.barVariant}
            replayToken={replayToken}
            captureLayout={capturePanel !== null}
          />
        ))}
      </div>

      {showFooter ? (
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
      ) : null}
    </div>
  );
}
