# Harness

One session = one model, one container, one round.

## Usage

```bash
export OPENROUTER_API_KEY=sk-or-...   # whichever profile you're running
./harness/run_session.sh glm-4.7 harness/profiles/glm-coding.sh A
BUDGET_MIN=90 RUNS=5 ./harness/run_session.sh qwen harness/profiles/openrouter-qwen.sh A
./harness/run_session.sh deepseek harness/profiles/deepseek.sh B
```

Artifacts land in `runs/<slug>-<timestamp>/`:
- `events.jsonl` — full pi event stream (the trace)
- `pi-home/` — pi session files (second copy of the trace)
- `work/` — everything the agent built (includes `submission/run.sh`)
- `measurements.txt` — the scored dataset (unique seed per session)
- `score.json` — verdict + timings
- `manifest.yaml` — image digest, host info, seeds

## Profiles

Each profile file defines:

| var | meaning |
|---|---|
| `PROVIDER` | pi provider id (`openrouter`, `deepseek`, `glm`, `openai`, ...) |
| `MODEL_ID` | model id for that provider |
| `AUTH_ENV` | name of the host env var holding the API key |
| `THINKING` | optional pi thinking level (`off`..`max`) |
| `NCPUS` / `MEM` | container cpu/memory caps — keep identical across models! |

Never put keys in profile files. The runner reads them from the host env.

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
- Image is pinned; digest recorded in the manifest. Same compilers, same
  glibc for every contestant.
- Scored dataset is generated per-session with a fresh seed (epoch time)
  — names differ every run, hardcoded tables buy nothing.
- Judge scores outside the container: warmup pass untimed, then 5 timed
  runs, median reported. Byte-exact output required.

## Docker digest pinning

After building the image on the target machine, optionally freeze it:

```bash
docker build -t 1brc-agents-sandbox:latest sandbox/
docker tag  1brc-agents-sandbox:latest 1brc-agents-sandbox:$(git -C . rev-parse --short HEAD)
```

Never rebuild mid-benchmark. If you must change the image, rerun all
sessions and keep both leaderboards separate.
