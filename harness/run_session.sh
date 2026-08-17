#!/usr/bin/env bash
# 1BRC-Agents session runner (host side).
#
# Usage: run_session.sh <model-slug> <profile-file> [round]
#
# 1. ensures image + datasets exist
# 2. starts container: network NONE, workdir /work, /data ro-mounted
# 3. runs pi --mode json headless inside it with the single goal prompt
# 4. enforces wall-clock budget (kills container at deadline)
# 5. scores round (default A) judge-side, writes run manifest
#
# Env: BUDGET_MIN (default 120), RUNS (default 5)

set -euo pipefail

SLUG="${1:?model slug, e.g. glm-4.7}"
PROFILE="${2:?profile file, see harness/profiles/}"
ROUND="${3:-A}"
BUDGET_MIN="${BUDGET_MIN:-120}"
RUNS_N="${RUNS:-5}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="1brc-agents-sandbox:latest"
STAMP="$(date -u +%Y%m%dT%H%M%S)"
RUNDIR="$ROOT/runs/${SLUG}-${STAMP}"
mkdir -p "$RUNDIR"

# --- datasets (dev lives in repo; scored is generated per-session) ---
DEV="$ROOT/data/measurements-dev.txt"
[ -s "$DEV" ] || python3 "$ROOT/judge/generator.py" 10_000_000 20260817 "$DEV"

SCORED="$RUNDIR/measurements.txt"
SCORED_SEED=$(date -u +%s)   # unique per session — held out from the agent
python3 "$ROOT/judge/generator.py" 100_000_000 "$SCORED_SEED" "$SCORED"

# /work is bind-mounted over the image's /work — seed the session workdir
# with the rulebook + tools, owned by the in-container agent user (1000).
# (chown via docker so the script works without host sudo.)
mkdir -p "$RUNDIR/work/submission"
cp "$ROOT/sandbox/program.md" "$RUNDIR/work/program.md"
cp -r "$ROOT/sandbox/tools" "$RUNDIR/work/tools"
chmod +x "$RUNDIR/work/tools/"*.py
docker run --rm -v "$RUNDIR/work:/w" -v "$RUNDIR/pi-home:/h" alpine:latest chown -R 1000:1000 /w /h

# --- image ---
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build -t "$IMAGE" "$ROOT/sandbox"

# --- profile: PROVIDER, MODEL_ID, AUTH_ENV (+ optional THINKING, NCPUS, MEM) ---
set -a; source "$PROFILE"; set +a
AUTH_VAL="${!AUTH_ENV:-}"
[ -n "$AUTH_VAL" ] || { echo "$AUTH_ENV not set — export it first"; exit 1; }
mkdir -p "$RUNDIR/pi-home"   # pi state (sessions = the trace!) persists here

CID_FILE="$RUNDIR/container.id"

echo "[$SLUG] starting: budget=${BUDGET_MIN}m round=$ROUND scored_rows=100M"

# --- launch pi headless inside the sandbox ---
GOAL_PROMPT="Read program.md and follow it exactly. Run fully autonomously — never stop, never ask for input, never wait for a human. Goal: make /work/submission/run.sh the fastest CORRECT solution for Round ${ROUND} (${ROUND} is defined in program.md) within your ${BUDGET_MIN}-minute budget. Keep run.sh valid at all times once your first correct version exists."

# Round B spec is revealed only in the launch prompt (anti-retrieval)
if [ "$ROUND" = "B" ]; then
  GOAL_PROMPT="$GOAL_PROMPT

Round B task (replaces Round A output): for each station print name=median/stdev where median is the middle value (mean of the two middle values for even counts) and stdev is the population standard deviation. Median rounded half-up to 1 decimal, stdev to 2 decimals (−0.0 normalized to 0.0). Same output envelope: {a=1.0/2.25, b=...}, stations sorted byte-wise."
fi

THINK_ARG=""
[ -n "${THINKING:-}" ] && THINK_ARG="--thinking $THINKING"

deadline=$(( $(date +%s) + BUDGET_MIN * 60 ))
( sleep $(( BUDGET_MIN * 60 + 300 )); docker kill "$(cat "$CID_FILE" 2>/dev/null)" 2>/dev/null || true ) &
WATCHDOG=$!

docker run --rm \
  --name "1brc-${SLUG}-${STAMP}" \
  --network none \
  --cpus="${NCPUS:-4}" --memory="${MEM:-8g}" \
  --user 1000:1000 \
  -e HOME=/home/agent \
  -e "${AUTH_ENV}=${AUTH_VAL}" \
  -v "$RUNDIR/work:/work" \
  -v "$RUNDIR/pi-home:/home/agent" \
  -v "$DEV:/data/measurements-dev.txt:ro" \
  -v "$SCORED:/data/measurements.txt:ro" \
  "$IMAGE" \
  --mode json \
  --provider "$PROVIDER" --model "$MODEL_ID" $THINK_ARG \
  --name "1brc-${SLUG}" \
  "$GOAL_PROMPT" \
  > "$RUNDIR/events.jsonl" 2> "$RUNDIR/pi.err" &

sleep 2
CID="$(docker ps -q --filter "name=1brc-${SLUG}-${STAMP}")"
echo "$CID" > "$CID_FILE"

# --- wait for pi to finish (container exits) or budget to elapse ---
while docker inspect "$(cat "$CID_FILE")" >/dev/null 2>&1; do
  NOW=$(date +%s)
  if [ "$NOW" -ge "$deadline" ]; then
    echo "[$SLUG] budget elapsed — killing agent"
    docker kill "$(cat "$CID_FILE")" || true
    break
  fi
  if ! kill -0 "$WATCHDOG" 2>/dev/null; then
    : # watchdog already fired
  fi
  sleep 15
done
kill "$WATCHDOG" 2>/dev/null || true
docker rm -f "$(cat "$CID_FILE")" >/dev/null 2>&1 || true

# --- score judge-side ---
echo "[$SLUG] scoring round $ROUND"
python3 "$ROOT/judge/score.py" \
  --round "$ROUND" \
  --input "$SCORED" \
  --submission "$RUNDIR/work/submission/run.sh" \
  --runs "$RUNS_N" \
  | tee "$RUNDIR/score.json" || true

# --- manifest ---
{
  echo "slug: $SLUG"
  echo "profile: $PROFILE"
  echo "round: $ROUND"
  echo "budget_min: $BUDGET_MIN"
  echo "started: $STAMP"
  echo "image: $(docker image inspect "$IMAGE" --format '{{.Id}}')"
  echo "host: $(uname -srmo)"
  echo "cpus: $(nproc)"
} > "$RUNDIR/manifest.yaml"
# append scored seed (kept out of the agent's view)
echo "dev_seed: 20260817 scored_seed: $SCORED_SEED" >> "$RUNDIR/manifest.yaml"

echo "[$SLUG] done — artifacts in $RUNDIR"
