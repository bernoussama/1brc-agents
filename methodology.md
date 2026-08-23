# Methodology

How the 1BRC-Agents benchmark is constructed, run, and graded. Snapshot
numbers live in [runs/2026-08-21-neutral-v0.5](runs/2026-08-21-neutral-v0.5/).

## What it measures

Retrieval, adaptation, and execution. Every 1BRC trick is already in the
training data. The test is whether an agent can assemble, verify, and iterate
on those ideas against a live profiler with no human in the loop. That is the
Prime Intellect finding restated for CPU: all models find the same ideas; the
gap is experimental discipline.

It does not measure novel algorithm invention.

## The task

Two rounds. Classic is the headline. The variant is the tiebreaker and
contamination check.

### Round A — Classic 1BRC

- Input: `measurements.txt`, 1,000,000,000 lines of `Station;temp` (temp = one
  decimal, e.g. `-12.3`).
- Output: `{station=min/mean/max; ...}` sorted by station, mean rounded to 1
  decimal, exact string match against the original 1BRC output spec.
- Station names follow the canonical Java generator
  (`dev.morling.onebrc.CreateMeasurements` from the sibling `1brc` checkout):
  a fixed 413-city list sampled randomly, with UTF-8 names and one-decimal
  temperatures. The source hash is recorded in each run manifest.

### Round B — Variant (anti-retrieval)

- Same input file, different aggregation, announced only when the agent
  session starts. Example: per-station median and standard deviation, or the
  top-10 most frequent temperature values per station.
- Forces actual implementation work; the exact solutions are not sitting in a
  GitHub repo.
- Breaks ties on the leaderboard and gets its own column.

## Environment

One dedicated box, sequential runs. No fleet of "same-spec" VPSes. Fairness
comes from the same silicon, the same image, and median-of-N scoring.

- Immutable pinned image: one distro, one kernel, snapshot taken before run 1
  and reused for every run. Image hash published.
- Toolchains preinstalled (no general network during runs): gcc, clang, rust,
  go, graalvm+java, zig, plus python/node for glue. Offline-strict except for
  model API traffic through the logging allowlist proxy.
- Dev dataset: 10M rows from a dedicated Java-generator process. The agent
  iterates against this.
- Scored dataset: 1B rows, generated and structurally validated once by a
  fresh Java-generator process, then reused byte-for-byte from a named
  read-only Docker volume for every session.

## Harness and agent

Adapted from Prime Intellect's harness to CPU:

- Agent runs headless in a Docker sandbox on the internal benchmark network.
  It sees its workdir, the datasets, the toolchains, and the model API proxy.
- The only network route is a logging proxy that allowlists the model API and
  nothing else. No web, no GitHub, no package registries.
- One fixed agent framework, one fixed prompt. Models vary; nothing else does.
- Launch protocol: `program.md` plus one message:

  > Read program.md and follow it exactly. Run fully autonomously — never
  > stop, never ask for input. Goal: produce the fastest correct solution for
  > the task in program.md within your budgets.

- Re-inject the goal message if the agent stalls or goes interactive.

The frozen run profile is [bench.yml](bench.yml). The session runner loads it
for image digests, CPU and memory caps, budgets, dataset pins, and timed-run
count. Profiles supply only the model and credentials.

## Budgets

- Wall clock: 4h agent time (dev + build + iteration), then hard stop. The
  published v0.5 batch used 1–2h caps.
- Token/cost cap: fixed per run, logged by the proxy. Hitting either cap ends
  the session; the best validated submission stands.
- Agent submits `run.sh` (build + execute). Build and warmup are untimed; only
  processing is timed (original 1BRC semantics).

## Scoring

Frozen verifier, judge-controlled only. The agent never touches the reference
output or the scoring state. `verify.py`, the Java generator source, and the
generator source hash are pinned and recorded before scoring. The submission
runs in the same benchmark container that produced it; the host coordinates
the handoff and computes the expected output.

- Correctness gate: exact string match on the scored dataset (round A) or
  exact match per spec (round B). Wrong output is a DQ for that round, no
  partial credit.
- Timing protocol (judge-run, not agent-run): after the agent exits, the
  locked volume file is unlocked for the preserved container; the harness
  performs one untimed warmup and then 5 scored executions, reporting the
  median. Same box, sequential, under the original image, CPU, memory, and
  filesystem environment.
- Per model: ≥3 independent agent sessions on the same frozen scored volume
  for a full release. Create a new volume only when the generator source or
  dataset definition changes. Leaderboard = best validated session; median
  of sessions is the consistency metric. The published v0.5 batch is n=1 and
  labeled as such.
- Reported per model: median runtime (headline), time-to-first-correct, total
  tokens, total cost, rounds passed.

## Anti-cheat

- Output mismatch → DQ. Sandbox escape, verifier tampering, dataset
  modification, network probing → DQ and a public log.
- Fresh random measurements plus the variant round cut memorized-output
  shortcuts. The canonical station list is intentionally the original 1BRC
  distribution.
- No general internet. Contamination is already in the weights; live lookup
  at least gets stopped. Only allowlisted model API domains are reachable
  through the proxy.
- Full proxy logs, shell history, and traces are published so the community
  can audit everything.

### The planted test

`program.md` gives the agents a suggested timing protocol ("run it 3 times
and take your best time"). That is deliberately suboptimal: best-of-3 is
noisy and gameable. The right move is measuring timing variance themselves
(page cache state, frequency scaling, CPU pinning) and building a proper
protocol. Log which agents measure the box themselves vs trust the doc.
Expect the self-measurers to cluster at the top, like Prime Intellect's
noise-estimation test (62/100 measured, 42 found the hidden trick, all
top-of-table).

## Publishing

Everything public from day one, in one repo:

- Harness, sandbox config, pinned image recipe, generator, frozen verifier
- Full traces, scratchpads, proxy logs, and token/cost ledger per run
- Published batches under `runs/<date>-<label>/`
