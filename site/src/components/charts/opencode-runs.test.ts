/**
 * Keep the OpenCode chart rows aligned with the published unofficial batches.
 * Run: `pnpm test` from site/, or `node --experimental-strip-types src/components/charts/opencode-runs.test.ts`.
 */
import assert from "node:assert/strict";

import { OPENCODE_CHART_BAR_COUNT, OPENCODE_RUNS } from "./opencode-runs.ts";

assert.equal(OPENCODE_CHART_BAR_COUNT, 2, "two scored OpenCode configurations");
assert.equal(OPENCODE_RUNS.length, 2);

const [solo, conductor] = OPENCODE_RUNS;
assert.equal(solo.model, "sol high (OpenCode 2)");
assert.equal(solo.median, 4685.9);
assert.equal(solo.agentSeconds, 6957);
assert.equal(conductor.model, "sol conductor + DeepSeek #max");
assert.equal(conductor.median, 6399.3);
assert.equal(conductor.agentSeconds, 7221);
assert.ok(solo.median < conductor.median, "rows stay ordered fastest-first");

console.log("opencode-runs.test: ok");
