# 1BRC-Agents

A benchmark where AI coding agents compete head-to-head to write the
fastest program for a 1BRC-style task — fully autonomously, with no general
network access, on identical pinned infrastructure. Model API traffic uses a
logging allowlist proxy.

Rules and design: see [RULESET.md](RULESET.md). Harness usage:
[harness/README.md](harness/README.md).

```
judge/       reference implementations, score coordinator     (host side)
             score_run.py (executed inside the benchmark container)
sandbox/     Dockerfile (pinned toolchain), program.md (agent rulebook),
             tools/verify.py + remaining_time.py (agent-side tools)
harness/     run_session.sh (one model = one session), profiles/
             prepare_scored_dataset.sh (one-time validated 1B volume),
             cleanup_run.sh (post-run transient cleanup)
data/        dev dataset (generated, not committed)
runs/        session artifacts: traces, work dirs, scores, manifests
results/     leaderboard notes

The host runner uses `dev.morling.onebrc.CreateMeasurements` from the sibling
`../1brc` checkout (override with `ONEBRC_ROOT`). The small Python generator
in `judge/generator.py` is retained only for deterministic synthetic smoke
tests.
```

## Quick start (on a beefy machine)

```bash
# 1. build the box once
docker build -t 1brc-agents-sandbox:latest sandbox/

# 2. lock the model-API network (once per host)
sudo ./harness/setup_network.sh

# 3. smoke-test the judge end-to-end (no agent involved)
bash harness/lib/onebrc_generator.sh 100000 /tmp/smoke.txt
mkdir -p /tmp/dummy && cp judge/reference.py /tmp/dummy/
printf '#!/bin/sh\nexec python3 "$(dirname "$0")/reference.py" "$1"\n' \
  > /tmp/dummy/run.sh && chmod +x /tmp/dummy/run.sh
# (score the dummy — expect correct: true)
python3 judge/score.py --host --round A --input /tmp/smoke.txt --submission /tmp/dummy/run.sh --runs 3

# 4. optionally prepare the shared 1B dataset and expected output now
./harness/prepare_scored_dataset.sh A

# 5. run a session (auto-prepares the volume if step 4 was skipped)
export OPENROUTER_API_KEY=...
BUDGET_MIN=120 ./harness/run_session.sh qwen harness/profiles/openrouter-qwen.sh A
```

## What a session looks like

1. `run_session.sh <slug> <profile> [round]` ensures the validated shared
   1B-row dataset volume and expected output cache exist, then seeds `/work`
   with `program.md` + tools
2. pi (headless, JSON mode) runs on an internal Docker network. Its model API
   traffic goes through the logging allowlist proxy; direct general egress is
   blocked.
3. Wall-clock budget enforced host-side; when the agent exits or reaches its
   deadline, the container stays alive for the scoring handoff
4. The held-out 1B-row volume is mounted read-only but unreadable by the
   agent UID. After the agent exits, the harness unlocks file read permission
   and runs the warmup and 5 timed executions in that same container; the
   reference comparison remains host-controlled
5. `score.json` + manifest record the container execution mode, image digest,
   resource limits, and host info; disposable mounts are cleaned afterward

## Honest-labeling rule

v0.5 results are **single-box, single-session, n=1 per model**. Publish
with that label and full traces. That transparency is the product.

## Credits / priors

- 1BRC by Gunnar Morling (the task)
- Prime Intellect's "Measuring Autonomous AI Research" (harness pattern:
  program.md, offline sandbox, frozen verifier, per-run manifests)
- pi (pi.dev) — the coding-agent harness
