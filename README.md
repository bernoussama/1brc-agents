# 1BRC-Agents

A benchmark where AI coding agents compete head-to-head to write the
fastest program for a 1BRC-style task — fully autonomously, offline,
on identical pinned infrastructure.

Rules and design: see [RULESET.md](RULESET.md). Harness usage:
[harness/README.md](harness/README.md).

```
judge/       generator, reference implementations, scorer   (host side)
sandbox/     Dockerfile (pinned toolchain), program.md (agent rulebook),
             tools/verify.py (agent-side self-check)
harness/     run_session.sh (one model = one session), profiles/
data/        dev dataset (generated, not committed)
runs/        session artifacts: traces, work dirs, scores, manifests
results/     leaderboard notes
```

## Quick start (on a beefy machine)

```bash
# 1. build the box once
docker build -t 1brc-agents-sandbox:latest sandbox/

# 2. smoke-test the judge end-to-end (no agent involved)
python3 judge/generator.py 100000 42 /tmp/smoke.txt
mkdir -p /tmp/dummy && cp judge/reference.py /tmp/dummy/
printf '#!/bin/sh\npython3 "$(dirname "$0")/reference-clone.py" "$1"\n' \
  > /tmp/dummy/run.sh && sed 's/reference-clone/reference/' /tmp/dummy/run.sh > /dev/null
# (score the dummy — expect correct: true)
python3 judge/score.py --round A --input /tmp/smoke.txt --submission /tmp/dummy/run.sh --runs 3

# 3. run a session
export OPENROUTER_API_KEY=...
BUDGET_MIN=120 ./harness/run_session.sh qwen harness/profiles/openrouter-qwen.sh A
```

## What a session looks like

1. `run_session.sh <slug> <profile> [round]` generates a fresh scored
   dataset (unique seed), seeds `/work` with `program.md` + tools
2. pi (headless, JSON mode) runs inside `--network none` Docker on the
   pinned toolchain image, driven by one goal prompt
3. Wall-clock budget enforced host-side; at the deadline the container
   dies and the best existing `submission/run.sh` is scored
4. Judge compares byte-exact vs reference, times 5 runs (median), writes
   `score.json` + manifest with image digest + host info

## Honest-labeling rule

v0.5 results are **single-box, single-session, n=1 per model**. Publish
with that label and full traces. That transparency is the product.

## Credits / priors

- 1BRC by Gunnar Morling (the task)
- Prime Intellect's "Measuring Autonomous AI Research" (harness pattern:
  program.md, offline sandbox, frozen verifier, per-run manifests)
- pi (pi.dev) — the coding-agent harness
