/** Cloud-agent Round A scored runs (excludes MiniMax M3 max outlier). */
export type CloudAgentRun = {
  model: string;
  median: number;
  agentSeconds: number;
  /** Null when metrics are unavailable (Cursor Grok proxy). */
  tokens: number | null;
  /** Estimated USD at list rates with cached-input pricing. Null when unavailable. */
  costUsd: number | null;
  metricsAvailable: boolean;
};

/** Generated from scripts/cloud_agent_cost.py — re-run to refresh. */
export const CLOUD_AGENT_RUNS: CloudAgentRun[] = [
  {
    model: "gpt-5.6-sol high",
    median: 1311.4,
    agentSeconds: 6933,
    tokens: 43_389_638,
    costUsd: 27.9813,
    metricsAvailable: true,
  },
  {
    model: "MiniMax M3 :free max",
    median: 3061.3,
    agentSeconds: 5201,
    tokens: 17_962_636,
    costUsd: 1.3445,
    metricsAvailable: true,
  },
  {
    model: "gpt-5.6-sol medium",
    median: 3174.4,
    agentSeconds: 6918,
    tokens: 29_702_282,
    costUsd: 20.9556,
    metricsAvailable: true,
  },
  {
    model: "Grok 4.6 high",
    median: 3953.1,
    agentSeconds: 7142,
    tokens: null,
    costUsd: null,
    metricsAvailable: false,
  },
  {
    model: "ox-alpha high",
    median: 3954.6,
    agentSeconds: 5145,
    tokens: 15_912_449,
    costUsd: 0,
    metricsAvailable: true,
  },
  {
    model: "gpt-5.6-luna max",
    median: 4610.3,
    agentSeconds: 6986,
    tokens: 92_539_605,
    costUsd: 2.2889,
    metricsAvailable: true,
  },
  {
    model: "Grok 4.6 medium",
    median: 5746.5,
    agentSeconds: 4896,
    tokens: null,
    costUsd: null,
    metricsAvailable: false,
  },
  {
    model: "Muse Spark free xhigh (r2)",
    median: 6500.8,
    agentSeconds: 7223,
    tokens: 12_440_896,
    costUsd: 0.2682,
    metricsAvailable: true,
  },
  {
    model: "MiniMax M2.7 max",
    median: 6562.3,
    agentSeconds: 3751,
    tokens: 10_761_907,
    costUsd: 0.8523,
    metricsAvailable: true,
  },
  {
    model: "ox-alpha max",
    median: 7256.5,
    agentSeconds: 7215,
    tokens: 91_250_567,
    costUsd: 0,
    metricsAvailable: true,
  },
];

export const CLOUD_CHART_BAR_COUNT = CLOUD_AGENT_RUNS.length;

/** Chart rows coerce unavailable metrics to zero bar height. */
export function cloudMetricBarValue(run: CloudAgentRun, key: "tokens" | "costUsd"): number {
  if (!run.metricsAvailable || run[key] == null) return 0;
  return run[key];
}
