# Harness

One session = one model, one benchmark container, one round. The same
container that runs the agent also runs the final submission score.

## Quick start

```bash
# 1. build the box once (from the repo root)
docker build -t 1brc-agents-sandbox:latest -f docker/Dockerfile .

# 2. lock the model-API network (once per host)
sudo ./harness/setup_network.sh

# 3. smoke-test the judge end-to-end (no agent involved)
bash harness/lib/onebrc_generator.sh 100000 /tmp/smoke.txt
mkdir -p /tmp/dummy && cp judge/reference.py /tmp/dummy/
printf '#!/bin/sh\nexec python3 "$(dirname "$0")/reference.py" "$1"\n' \
  > /tmp/dummy/run.sh && chmod +x /tmp/dummy/run.sh
python3 judge/score.py --host --round A --input /tmp/smoke.txt \
  --submission /tmp/dummy/run.sh --runs 3

# 4. optionally prepare the shared 1B dataset and expected output now
./harness/prepare_scored_dataset.sh A

# 5. run a session (auto-prepares the volume if step 4 was skipped)
export OPENROUTER_API_KEY=...
./harness/run_session.sh qwen harness/profiles/openrouter-qwen.sh
```

Environment, budget, dataset size, and timed-run count come from
[bench.yml](../bench.yml). Host presets under `hosts:` pick the resource
envelope for the machine the bench is running on (`laptop` = 6 CPUs / 16 GiB
for the published v0.5 box; `cloud-agent` = 4 CPUs / 16 GiB for Cursor cloud
VMs; set `BENCH_HOST` to force one). Profiles supply only the model and
credentials. For a local smoke test that changes resource caps, set
`BENCH_ALLOW_OVERRIDE=1`.

## Usage

Set up the internal network and allowlist proxy once on the host before the
first session:

```bash
sudo ./harness/setup_network.sh
```

```bash
export OPENROUTER_API_KEY=sk-or-...   # whichever profile you're running
./harness/run_session.sh glm-4.7 harness/profiles/glm-coding.sh
./harness/run_session.sh glm-5.3 harness/profiles/glm-5.3.sh
./harness/run_session.sh deepseek harness/profiles/deepseek.sh B
# Force the laptop resource preset on a different machine:
BENCH_HOST=laptop ./harness/run_session.sh qwen harness/profiles/openrouter-qwen.sh
# Local smoke test with a shorter budget:
BENCH_ALLOW_OVERRIDE=1 BUDGET_MIN=5 ./harness/run_session.sh qwen harness/profiles/openrouter-qwen.sh
```

Session scratch lands in `.sessions/<slug>-<timestamp>/` (gitignored):
- `events.jsonl` — full agent event stream (pi JSON mode, or OpenCode 2 `--format json`)
- `work/` — everything the agent built (includes `submission/run.sh`)
- `control/budget.json` — read-only authoritative session deadline metadata
- `score.json` — verdict + timings
- `score.log` — live judge progress, including reference-generation time
- `manifest.yaml` — image digest, host info, generator source hash
- `cleanup.log` — exact disposable paths removed after the session

Published batches live under `runs/<date>-<label>/`.

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
./harness/cleanup_run.sh .sessions/<slug>-<timestamp>
```

`EXPERIMENT_MAX_SEC` defaults to 300. The runner stops a top-level agent shell
that bypasses `1brc-bounded` for longer than this cap and records the count in
`manifest.yaml`; normal experiments should use the shorter explicit helper
timeout.

For in-container Cursor proxy profiles, `CURSOR_PROXY_TIMEOUT_MS` defaults to
the session budget minus `BUDGET_WRAPUP_SEC`, so a long Cursor tool turn is not
cut off by a separate 15-minute bridge timeout. Set it explicitly only when a
shorter per-completion limit is intentional; the selected value is recorded in
`manifest.yaml`. The allowlist proxy's `PROXY_IDLE_TIMEOUT_MS` defaults to `0`
(disabled) for the same reason: a short CONNECT idle kill shows up as pi
`errorMessage: terminated`. After changing the proxy, rerun
`sudo ./harness/setup_network.sh`. Cursor sessions also disable Node/undici's
default 300s fetch `bodyTimeout` inside the agent container, write pi
`settings.json` with `httpIdleTimeoutMs: 0` (pi otherwise replaces that
dispatcher with a 300s idle abort), and raise `retry.maxRetries` so a long
session can survive several Cursor CLI drops.

`run_session.sh` copies itself to a temp snapshot and re-execs immediately so
later harness edits cannot shift line numbers under a live session (bash
re-reads the script from disk; that previously aborted scoring with
`VFS: command not found`).

## Profiles

Each profile file defines model identity and credentials only.
Resource caps, budgets, and judge settings come from `bench.yml`.

| var | meaning |
|---|---|
| `AGENT_FRAMEWORK` | `pi` (default) or `opencode` for a native OpenCode 2 CLI session |
| `PROVIDER` | pi provider id, or OpenCode 2 provider prefix (`opencode`, `openrouter`, ...) |
| `MODEL_ID` | model id for that provider |
| `AUTH_MODE` | `env` for an API key, `file` for a credential file, or `none` |
| `AUTH_ENV` | name of the host env var holding the API key |
| `AUTH_EXTRA_ENVS` | optional extra host env var names to inject (comma- or space-separated), e.g. `OPENROUTER_API_KEY` next to Codex OAuth |
| `AUTH_FILE` | host path to `auth.json` (pi) or OpenCode 2 `opencode.db` when `AUTH_MODE=file` |
| `THINKING` | optional reasoning level (`off`..`max`, or OpenCode 2 variants such as `xhigh`) |
| `ADAPTER_ROUTE` | publication label for the complete model/provider adapter path |
| `OPENCODE_AGENT` | optional OpenCode 2 `--agent` id (e.g. `conductor`) |
| `OPENCODE_CONFIG` | optional OpenCode 2 jsonc path; defaults to `harness/lib/opencode.v2.jsonc` |
| `OPENCODE_PLUGIN_DIR` | optional plugin source copied into the session OpenCode home |
| `OPENCODE_AGENT_FILES` | optional agent markdown copied into `/work/.opencode/agents` |

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
The runner mounts `.sessions/<...>/pi-home` over `/home/agent`, so each
session starts with a clean but pre-configured agent home (pi state and, for
native OpenCode 2 sessions, `~/.config/opencode/opencode.jsonc`).

### Native OpenCode 2 CLI track

`AGENT_FRAMEWORK=opencode` runs OpenCode 2 (`opencode2 run --standalone`)
instead of pi. That is a separate adapter from the pi-to-Zen profiles
(`harness/profiles/opencode-ox-alpha.sh` and friends). Do not mix the two
on one leaderboard.

The runner seeds native V2 config (ordered `permissions` with `shell`, not
V1 `permission`/`bash`), denies `question`/`webfetch`/`websearch`, and
allows `external_directory` so `/data` does not hang headless. `--auto`
covers any remaining `ask`. `--standalone` gives the session a private
server instead of V2's shared background service. The seeded
`opencode.jsonc` is chowned to uid 1000 after copy so the container user
can read it on hosts whose login uid is not 1000.

Model selection is `-m provider/model` with an optional `#variant` from
`THINKING` (for example `opencode/x-preview-f-free#max`). Starting
profiles: `harness/profiles/opencode-cli-ox-alpha.sh`,
`opencode-cli-hy3-free-high.sh`, `opencode-cli-muse-spark-free-xhigh.sh`,
and `opencode-cli-gpt-5.6-sol-high.sh` (ChatGPT/Codex OAuth).
`opencode-cli-gpt-5.6-sol-high-conductor.sh` is a separate adapter: Sol
high is the `conductor` primary via the vendored
[opencode-conductor](https://github.com/bernoussama/opencode-conductor)
plugin. The conductor calls first-class `1brc_remaining_time` and
`1brc_resources` tools itself (PATH helpers wrapped by the plugin; no
general `shell`). Workers use the OpenRouter preset
`openrouter/@preset/ds-v4-1-flash` and keep `1brc-bounded` experiments.
The 2026-09-19 `T213507` session used `deepseek/deepseek-v4.1-flash#max`
instead. It is not comparable to the solo Sol-high OpenCode 2 session.

Session agent markdown is seeded into `/work/.opencode/agents` from
`harness/lib/opencode.conductor.agents`. That tree is the source of truth
for worker models and orchestration (foreground OpenRouter `@preset/ds-v4-1-flash` workers).
The plugin's bundled `agents/` files are upstream defaults (muse-spark
workers, parallel fan-out) and are not installed in this profile
(`installAgents: false`). OpenCode 2 injects `@opencode/plugin` when
loading the local plugin package, so the seeded tree does not include
`node_modules`. The 2026-09-19 `T213507` session did not retain
`[conductor]` console lines (`agent.err` empty; `pi-home` removed on
cleanup), but it dispatched `conductor/explore`, `conductor/shell-runner`,
and `conductor/coder` — namespaced workers the plugin registers — which
is the evidence the SDK import resolved without vendored `node_modules`.

`events.jsonl` for this track is OpenCode 2 `--format json`, not pi JSON
mode. Leaderboard/trace consumers must key off `agent_framework` /
`agent_bin` in the session manifest instead of assuming pi's event shape.

```bash
./harness/run_session.sh ox-alpha-opencode2 harness/profiles/opencode-cli-ox-alpha.sh
./harness/run_session.sh gpt-5.6-sol-high-opencode2 harness/profiles/opencode-cli-gpt-5.6-sol-high.sh
export OPENROUTER_API_KEY=sk-or-...
./harness/run_session.sh gpt-5.6-sol-high-conductor \
  harness/profiles/opencode-cli-gpt-5.6-sol-high-conductor.sh
```

Prefer `AUTH_MODE=env` (`OPENCODE_API_KEY`) for paid Zen. Keyless free
models use `AUTH_MODE=none`. `AUTH_MODE=file` copies either a legacy
`auth.json` or an OpenCode 2 `opencode.db` (+ wal/shm) into the session
data dir. Stop any host `opencode2` server before copying; the runner
runs `PRAGMA wal_checkpoint(TRUNCATE)` when `sqlite3` is available.

Codex ChatGPT login on the host:

```
opencode2 auth login --standalone openai --method chatgpt-headless
```

That profile sets `OPENCODE_MODELS_FETCH=1` so `gpt-5.6-sol` can come from
`models.dev` (allowlisted in `setup_network.sh`).

## Timing fairness (the bit that keeps the leaderboard honest)

- Sessions run **sequentially** on the same machine, nothing else running.
- Images and the agent versions (pi and OpenCode 2) are pinned; digests are
  recorded in the manifest. Same compilers, same glibc for every contestant.
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
  limits separately from visible host topology. The active `hosts.*` preset in
  `bench.yml` sets the current envelope (laptop: 6 CPU-equivalents / 16 GiB).
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
docker build -t 1brc-agents-sandbox:latest -f docker/Dockerfile .
docker tag  1brc-agents-sandbox:latest 1brc-agents-sandbox:$(git -C . rev-parse --short HEAD)
```

A rebuild that adds OpenCode 2 changes the digest. Update
`environment.image_digest` in `bench.yml` after that build. Native OpenCode 2
sessions need `opencode2` in the image; v0.5 numbers stay on
`sha256:ebc131d3…`.

Never rebuild mid-benchmark. If you must change the image, rerun all
sessions and keep both leaderboards separate.

Focused harness checks:

```bash
bash harness/tests/test_bench.sh
bash harness/tests/test_auth.sh
bash harness/tests/test_firewall.sh
node harness/tests/test_proxy.js
bash harness/tests/test_1brc.sh
bash harness/tests/test_profiling.sh
bash harness/tests/test_budget.sh
bash harness/tests/test_runner_snapshot.sh
bash harness/tests/test_resources.sh
bash harness/tests/test_scoring_container.sh
bash harness/tests/test_scored_dataset.sh
bash harness/tests/test_cleanup.sh
bash harness/tests/test_agent_framework.sh
# Or validate a submission against the sibling project's canonical samples:
bash harness/tests/test_1brc.sh /path/to/run.sh
```

The session container receives only Docker's `PERFMON` capability, allowing
per-container `perf` sampling without running the agent privileged. The image
also includes Perl, Graphviz `dot`, and the pinned FlameGraph collapse/render
scripts.
