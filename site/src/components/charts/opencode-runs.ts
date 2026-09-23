/** Native OpenCode 2 cloud-agent Round A scored runs (separate from the pi dashboard). */
export type OpenCodeRun = {
  model: string;
  median: number;
  agentSeconds: number;
};

/** From runs/2026-09-19-opencode2-cloud-agent, runs/2026-09-19-opencode-conductor-cloud-agent, runs/2026-09-20-opencode-conductor-preset-cloud-agent, and runs/2026-09-20-opencode-conductor-luna-cloud-agent. */
export const OPENCODE_RUNS: OpenCodeRun[] = [
  {
    model: "sol high (OpenCode 2)",
    median: 4685.9,
    agentSeconds: 6957,
  },
  {
    model: "sol conductor + DeepSeek #max",
    median: 6399.3,
    agentSeconds: 7221,
  },
  {
    model: "sol conductor + OR preset",
    median: 7282.5,
    agentSeconds: 6914,
  },
  {
    model: "sol conductor + Luna #max",
    median: 13628.0,
    agentSeconds: 6545,
  },
];

export const OPENCODE_CHART_BAR_COUNT = OPENCODE_RUNS.length;
