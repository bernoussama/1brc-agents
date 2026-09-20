import { useEffect, useState } from "react";

import { CloudMetricPanel } from "./CloudMetricPanel";
import {
  formatMinutesFromSeconds,
  formatYAxisMinutesFromSeconds,
} from "./format-minutes";
import { formatSecondsFromMs, formatYAxisSecondsFromMs } from "./format-seconds";
import { OPENCODE_CHART_BAR_COUNT, OPENCODE_RUNS } from "./opencode-runs";

const medianData = OPENCODE_RUNS.map(({ model, median }) => ({ model, median }));

const agentTimeData = OPENCODE_RUNS.map(({ model, agentSeconds }) => ({
  model,
  agentSeconds,
}));

type CapturePanel = "median-run-time" | "agent-wall-time";

function readCapturePanel(): CapturePanel | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("capture")) return null;
  const panel = params.get("panel");
  if (panel === "median-run-time" || panel === "agent-wall-time") {
    return panel;
  }
  return null;
}

/** Two-up dashboard: median and agent wall time for native OpenCode 2. Mount with `client:load`. */
export default function OpenCodeDashboard() {
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
    },
  ];

  const visiblePanels = capturePanel
    ? panels.filter((panel) => panel.slug === capturePanel)
    : panels;

  return (
    <div className={capturePanel ? "not-prose flex min-h-[24rem] items-center justify-center p-4" : "not-prose flex flex-col gap-8"}>
      {showHeader ? (
        <header className="flex flex-col gap-2 text-center">
          <h1 className="font-mono text-xl font-semibold text-foreground sm:text-2xl">
            Cloud-agent Round A — OpenCode 2
          </h1>
          <p className="font-mono text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Xeon 4 CPU / 16 GiB · 120m budget · native <code className="text-foreground">opencode2</code>{" "}
            CLI · GPT-5.6 Sol high solo and Sol conductor with DeepSeek #max, OpenRouter preset, or Luna #max workers
          </p>
        </header>
      ) : null}

      <div className={capturePanel ? "w-full max-w-3xl" : "grid grid-cols-1 gap-8 xl:grid-cols-2 xl:gap-4"}>
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
            bloom={panel.bloom}
            barVariant={panel.barVariant}
            replayToken={replayToken}
            barCount={OPENCODE_CHART_BAR_COUNT}
          />
        ))}
      </div>

      {showFooter ? (
        <footer className="font-mono text-[10px] text-muted-foreground sm:text-xs">
          <p className="text-right">
            Source:{" "}
            <a className="text-foreground underline" href="https://github.com/bernoussama/1brc-agents/tree/main/runs/2026-09-19-opencode2-cloud-agent">
              opencode2-cloud-agent
            </a>
            {" · "}
            <a className="text-foreground underline" href="https://github.com/bernoussama/1brc-agents/tree/main/runs/2026-09-19-opencode-conductor-cloud-agent">
              opencode-conductor-cloud-agent
            </a>
            {" · "}
            <a className="text-foreground underline" href="https://github.com/bernoussama/1brc-agents/tree/main/runs/2026-09-20-opencode-conductor-preset-cloud-agent">
              opencode-conductor-preset-cloud-agent
            </a>
            {" · "}
            <a className="text-foreground underline" href="https://github.com/bernoussama/1brc-agents/tree/main/runs/2026-09-20-opencode-conductor-luna-cloud-agent">
              opencode-conductor-luna-cloud-agent
            </a>
          </p>
          <p className="mt-2 leading-relaxed">
            Median is warm-cache processing time on the held-out billion-row file (seconds). Agent wall
            time is harness clock until scoring (minutes). Token and list-rate cost are omitted: OpenCode
            events do not match the pi cost script, and the conductor mix of Codex plus OpenRouter is
            not one list price. Not comparable to the{" "}
            <a className="text-foreground underline" href="/charts/cloud-agent/">
              pi cloud-agent dashboard
            </a>{" "}
            or to laptop v0.5.
          </p>
        </footer>
      ) : null}
    </div>
  );
}
