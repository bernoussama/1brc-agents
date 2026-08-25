/** Cloud-agent Round A scored runs (excludes MiniMax M3 max outlier). */
export const CLOUD_AGENT_RUNS = [
  {
    model: "gpt-5.6-sol high",
    median: 1311.4,
    agentSeconds: 6933,
    tokens: 43_389_638,
  },
  {
    model: "MiniMax M3 :free max",
    median: 3061.3,
    agentSeconds: 5201,
    tokens: 17_962_636,
  },
  {
    model: "gpt-5.6-sol medium",
    median: 3174.4,
    agentSeconds: 6918,
    tokens: 29_702_282,
  },
  {
    model: "Grok 4.6 high",
    median: 3953.1,
    agentSeconds: 7142,
    tokens: 2536,
  },
  {
    model: "ox-alpha high",
    median: 3954.6,
    agentSeconds: 5145,
    tokens: 15_912_449,
  },
  {
    model: "gpt-5.6-luna max",
    median: 4610.3,
    agentSeconds: 6986,
    tokens: 92_539_605,
  },
  {
    model: "Grok 4.6 medium",
    median: 5746.5,
    agentSeconds: 4896,
    tokens: 2842,
  },
  {
    model: "Muse Spark free xhigh (r2)",
    median: 6500.8,
    agentSeconds: 7223,
    tokens: 12_440_896,
  },
  {
    model: "MiniMax M2.7 max",
    median: 6562.3,
    agentSeconds: 3751,
    tokens: 10_761_907,
  },
  {
    model: "ox-alpha max",
    median: 7256.5,
    agentSeconds: 7215,
    tokens: 91_250_567,
  },
] as const;

export const CLOUD_CHART_BAR_COUNT = CLOUD_AGENT_RUNS.length;
