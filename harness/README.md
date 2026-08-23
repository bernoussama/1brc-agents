# Harness

One session = one model, one benchmark container, one round. The same
container that runs the agent also runs the final submission score.

## Usage

Set up the internal network and allowlist proxy once on the host before the
first session:

```bash
sudo ./harness/setup_network.sh
```

```bash
export OPENROUTER_API_KEY=sk-or-...   # whichever profile you're running
./harness/run_session.sh glm-4.7 harness/profiles/glm-coding.sh A
BUDGET_MIN=90 RUNS=5 ./harness/run_session.sh qwen harness/profiles/openrouter-qwen.sh A
BUDGET_WRAPUP_SEC=600 ./harness/run_session.sh glm-5.3 harness/profiles/glm-5.3.sh A
./harness/run_session.sh deepseek harness/profiles/deepseek.sh B
```

Artifacts land in `runs/<slug>-<timestamp>/`:
- `events.jsonl` — full pi event stream (the trace)
- `work/` — everything the agent built (includes `submission/run.sh`)
- `control/budget.json` — read-only authoritative session deadline metadata
- `score.json` — verdict + timings
- `score.log` — live judge progress, including reference-generation time
- `manifest.yaml` — image digest, host info, generator source hash
- `cleanup.log` — exact disposable paths removed after the session

The runner expects the sibling checkout at `../1brc` by default. Set
`ONEBRC_ROOT` to another checkout when needed. It compiles and runs
`src/main/java/dev/morling/onebrc/CreateMeasurements.java` in a temporary
directory, so the sibling worktree is never modified. Its canonical 413-city
station list is used for both the 10M-row development file and the 1B-row
scored file.

The first session prepares and validates one 1B-row Java-generator output in
the named volume `1brc-agents-scored-1b-v1`; later sessions reuse its bytes.
The volume metadata records row count, byte count, generator-source hash, and
dataset SHA-256. The reference output for each round is also cached once on
the host. The volume is mounted read-only in the agent container, with the
measurement file locked from UID 1000 until the agent exits. The harness then
unlocks only the file mode and scores through the existing `/data/measurements.txt`
path. The host coordinates the frozen reference comparison, but never
executes the submission directly.

Prepare it explicitly with `./harness/prepare_scored_dataset.sh A` (or `B`);
`run_session.sh` performs the same check automatically. Set
`SCORED_DATASET_VOLUME` to use a different persistent dataset volume.

After scoring, the runner removes the per-session `data/`, `lifecycle/`, and
`pi-home/` mounts, the stale container ID, and legacy per-run scored-input
files. This also removes copied credentials and avoids retaining another copy
of the 1B-row input. Traces, `work/`, scores, manifests, budget metadata, and
logs remain. The persistent scored volume and expected-output cache are outside
the run directory and are never removed by this cleanup. Set
`CLEANUP_RUN_ARTIFACTS=0` when retaining transient files for debugging, or
clean an existing completed run explicitly with:

```bash
./harness/cleanup_run.sh runs/<slug>-<timestamp>
```

`EXPERIMENT_MAX_SEC` defaults to 300. The runner stops a top-level agent shell
that bypasses `1brc-bounded` for longer than this cap and records the count in
`manifest.yaml`; normal experiments should use the shorter explicit helper
timeout.

For in-container Cursor proxy profiles, `CURSOR_PROXY_TIMEOUT_MS` defaults to
the session budget minus `BUDGET_WRAPUP_SEC`, so a long Cursor tool turn is not
cut off by a separate 15-minute bridge timeout. Set it explicitly only when a
shorter per-completion limit is intentional; the selected value is recorded in
`manifest.yaml`.

## Profiles

Each profile file defines:

| var | meaning |
|---|---|
| `PROVIDER` | pi provider id (`openrouter`, `deepseek`, `glm`, `openai`, ...) |
| `MODEL_ID` | model id for that provider |
| `AUTH_MODE` | `env` for an API key or `file` for a pi OAuth file |
| `AUTH_ENV` | name of the host env var holding the API key |
| `AUTH_FILE` | host path to `auth.json` when `AUTH_MODE=file` |
| `THINKING` | optional pi thinking level (`off`..`max`) |
| `ADAPTER_ROUTE` | publication label for the complete model/provider adapter path |
| `NCPUS` / `MEM` | container CPU-equivalent and memory caps; keep identical when comparing models |

Never put keys in profile files. The runner reads them from the host env.
For OAuth, log in once on the host with `pi` and point `AUTH_FILE` at the
resulting `~/.pi/agent/auth.json`.

The current runner must give pi the provider credential so it can authenticate.
Commands launched by pi share that process environment and can therefore read
the credential. The network boundary is fail-closed, but this is not a
brokered secret-isolation boundary; use trusted benchmark agents until a
credential broker is added.

### GLM coding-plan endpoint

If the plan gives you a custom OpenAI-compatible base URL, it must be
configured once in pi on the machine that runs sessions:

```
pi   # interactive once on the runner host, or edit ~/.pi/agent/models.json
```

Add the endpoint as a custom provider (pi docs → Custom Providers /
Custom Models), then point `PROVIDER`/`MODEL_ID` in the profile at it.
The runner mounts `runs/<...>/pi-home` over `/home/agent`, so each session
starts with a clean but pre-configured pi state.

## Timing fairness (the bit that keeps the leaderboard honest)

- Sessions run **sequentially** on the same machine, nothing else running.
- Images and the pi version are pinned; digests are recorded in the manifest.
  Same compilers, same glibc for every contestant.
- One validated 1B-row dataset is generated once by a fresh Java generator
  process and reused from a named read-only Docker volume. Its exact bytes,
  row count, and generator source hash are recorded in the volume metadata and
  each session manifest.
- The expected output is cached once per exact dataset, round, and
  reference-source hash; later sessions do not regenerate the 1B-row file or
  recompute the reference.
- The container exposes `1brc-remaining-time`, backed by the read-only
  `control/budget.json` file. Agents must use it for remaining-time decisions;
  the manifest records the actual stop reason and elapsed time.
- The container exposes `1brc-resources`, which reports cgroup CPU and memory
  limits separately from visible host topology. The GLM 5.3 profile uses the
  current host baseline of 6 CPU-equivalents and 16 GiB.
- Candidate commands should use `1brc-bounded`; it isolates an experiment's
  process group and cleans up descendants after a timeout. Docker's `--init`
  is also enabled so orphaned children are reaped.
- The submission is scored inside the same container after the held-out input
  is injected: warmup pass untimed, then 5 timed runs, median reported.
  Timing is measured inside the container so `docker exec` startup overhead is
  excluded. Byte-exact output remains required.
- Manifests record the exact model and thinking level, adapter route, agent
  version, Git state, prompt/profile/judge/runner hashes, image digests, host
  CPU identity, and warm-cache policy. A session command exits non-zero when
  scoring fails, even though its manifest and cleanup evidence are preserved.

For a local scorer-only smoke test without Docker, use `judge/score.py --host`
explicitly. Benchmark sessions always pass `--container` and do not use that
mode.

## Docker digest pinning

After building the image on the target machine, optionally freeze it:

```bash
docker build -t 1brc-agents-sandbox:latest sandbox/
docker tag  1brc-agents-sandbox:latest 1brc-agents-sandbox:$(git -C . rev-parse --short HEAD)
```

Never rebuild mid-benchmark. If you must change the image, rerun all
sessions and keep both leaderboards separate.

Focused harness checks:

```bash
bash harness/tests/test_auth.sh
bash harness/tests/test_firewall.sh
node harness/tests/test_proxy.js
bash harness/tests/test_1brc.sh
bash harness/tests/test_profiling.sh
bash harness/tests/test_budget.sh
bash harness/tests/test_resources.sh
bash harness/tests/test_scoring_container.sh
bash harness/tests/test_scored_dataset.sh
bash harness/tests/test_cleanup.sh
# Or validate a submission against the sibling project's canonical samples:
bash harness/tests/test_1brc.sh /path/to/run.sh
```

The session container receives only Docker's `PERFMON` capability, allowing
per-container `perf` sampling without running the agent privileged. The image
also includes Perl, Graphviz `dot`, and the pinned FlameGraph collapse/render
scripts.
