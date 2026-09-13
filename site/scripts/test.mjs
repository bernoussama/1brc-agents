#!/usr/bin/env node
/**
 * Runs every `.test.ts` self-check under `src/` with Node's type stripping — no test framework, no
 * config, no fixtures (house rule, see AGENTS.md: non-trivial logic leaves ONE runnable check
 * behind). Discovery-based, so a check written next to the code it covers runs without being
 * registered anywhere; sorted, so failures always report in the same order.
 *
 * One convention, one path: a file named `*.test.ts` anywhere under `src/`. Nothing runs twice.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const src = path.join(root, "src");

const tests = readdirSync(src, { recursive: true })
  .filter((file) => file.endsWith(".test.ts"))
  .map((file) => path.join("src", file))
  .sort();

// Zero checks is a failure, not a pass: the whole point of discovery is that it cannot quietly
// stop finding the checks it is supposed to run.
if (tests.length === 0) {
  console.error("No checks found under src/ — expected at least one *.test.ts file.");
  process.exit(1);
}

const failed = [];
for (const file of tests) {
  // `--disable-warning` silences the per-child "Type Stripping is experimental" notice, which would
  // otherwise be two thirds of this command's output. The flag is still passed explicitly so the
  // runner works on the Node 22.12 floor in package.json `engines`, not just on 23.6+ where
  // stripping is on by default.
  const { status } = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", file],
    { cwd: root, stdio: "inherit" },
  );
  if (status !== 0) failed.push(file);
  console.log(`${status === 0 ? "PASS" : "FAIL"}  ${file}`);
}

console.log(`\n${tests.length - failed.length}/${tests.length} check files passed.`);
if (failed.length > 0) {
  console.error(failed.map((file) => `  FAILED  ${file}`).join("\n"));
  process.exit(1);
}
