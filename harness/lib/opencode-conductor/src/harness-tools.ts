import { spawnSync } from "node:child_process";

import type { ConductorHarnessTool } from "./contract";

export const HARNESS_BINARIES: Record<ConductorHarnessTool, string> = {
  "1brc_remaining_time": "1brc-remaining-time",
  "1brc_resources": "1brc-resources",
};

const HARNESS_TOOL_TIMEOUT_MS = 15_000;

export function runHarnessBinary(command: string): { content: string } {
  const result = spawnSync(command, [], {
    encoding: "utf8",
    timeout: HARNESS_TOOL_TIMEOUT_MS,
    env: process.env,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const output = (stdout + (stderr ? `\n${stderr}` : "")).trim();
  if (result.error) {
    return { content: JSON.stringify({ error: result.error.message, command }) };
  }
  if (result.status !== 0) {
    return {
      content: JSON.stringify({
        error: "command_failed",
        command,
        status: result.status,
        output,
      }),
    };
  }
  return { content: output };
}

export const HARNESS_TOOL_SPECS: ReadonlyArray<{
  name: ConductorHarnessTool;
  description: string;
  command: string;
}> = [
  {
    name: "1brc_remaining_time",
    description:
      "Authoritative remaining session budget. Returns JSON with remaining_seconds, deadline_utc, and phase (optimize|wrap-up|expired). Call this yourself at startup, after major worker batches, and before deciding the session is done. Do not estimate time from wall clocks or worker reports.",
    command: HARNESS_BINARIES["1brc_remaining_time"],
  },
  {
    name: "1brc_resources",
    description:
      "Authoritative container CPU and memory limits. Returns JSON with effective_cpu_cpus, cpu_quota_cpus, and memory_limit_bytes. Call this yourself before choosing worker counts. Do not trust nproc or free alone.",
    command: HARNESS_BINARIES["1brc_resources"],
  },
];
