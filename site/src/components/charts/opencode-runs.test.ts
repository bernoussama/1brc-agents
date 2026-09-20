/**
 * Keep the OpenCode chart rows aligned with the published unofficial batches.
 * Run: `pnpm test` from site/, or `node --experimental-strip-types src/components/charts/opencode-runs.test.ts`.
 */
import assert from "node:assert/strict";

import { OPENCODE_CHART_BAR_COUNT, OPENCODE_RUNS } from "./opencode-runs.ts";

assert.equal(OPENCODE_CHART_BAR_COUNT, 3, "three scored OpenCode configurations");
assert.equal(OPENCODE_RUNS.length, 3);

const [solo, conductorMax, conductorPreset] = OPENCODE_RUNS;
assert.equal(solo.model, "sol high (OpenCode 2)");
assert.equal(solo.median, 4685.9);
assert.equal(solo.agentSeconds, 6957);
assert.equal(conductorMax.model, "sol conductor + DeepSeek #max");
assert.equal(conductorMax.median, 6399.3);
assert.equal(conductorMax.agentSeconds, 7221);
assert.equal(conductorPreset.model, "sol conductor + OR preset");
assert.equal(conductorPreset.median, 7282.5);
assert.equal(conductorPreset.agentSeconds, 6914);
assert.ok(solo.median < conductorMax.median, "rows stay ordered fastest-first");
assert.ok(conductorMax.median < conductorPreset.median, "preset workers slower than #max workers");

console.log("opencode-runs.test: ok");
