#!/usr/bin/env bash
# 1BRC-Agents session runner (host side).
#
# Usage: run_session.sh <model-slug> <profile-file> [round]
#
# Frozen environment, budget, dataset, and judge settings come from
# bench.yml at the repo root. The profile file supplies only model identity
# and credentials. Set BENCH_ALLOW_OVERRIDE=1 to let env vars override
# bench.yml for local smoke tests.
#
# 1. ensures image + datasets exist
# 2. starts container: internal network + allowlist proxy, workdir /work,
#    /data ro-mounted
# 3. runs pi --mode json headless inside it with the single goal prompt
# 4. enforces wall-clock budget (stops pi at deadline, preserves container)
# 5. injects the held-out input and scores inside the agent container
#    before releasing it, then writes the run manifest
#
# Env: BENCH_FILE (default: <repo>/bench.yml), BENCH_ALLOW_OVERRIDE=0|1,
#      CLEANUP_RUN_ARTIFACTS (default 1). With BENCH_ALLOW_OVERRIDE=1 also
#      accepts BUDGET_MIN, BUDGET_WRAPUP_SEC, EXPERIMENT_MAX_SEC, RUNS,
#      NCPUS, MEM, SCORED_DATASET_VOLUME.

set -euo pipefail

SLUG="${1:?model slug, e.g. glm-4.7}"
PROFILE="${2:?profile file, see harness/profiles/}"
ROUND_ARG="${3:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BENCH_FILE="${BENCH_FILE:-$ROOT/bench.yml}"
BENCH_ALLOW_OVERRIDE="${BENCH_ALLOW_OVERRIDE:-0}"
case "$BENCH_ALLOW_OVERRIDE" in
  0|1) ;;
  *) echo "BENCH_ALLOW_OVERRIDE must be 0 or 1" >&2; exit 2 ;;
esac

LOAD_BENCH="$ROOT/harness/lib/load_bench.py"
[ -f "$LOAD_BENCH" ] || { echo "missing bench loader: $LOAD_BENCH" >&2; exit 1; }
[ -f "$BENCH_FILE" ] || { echo "missing bench profile: $BENCH_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
eval "$(python3 "$LOAD_BENCH" "$BENCH_FILE")"

apply_bench_value() {
  local var="$1" bench_value="$2" override_env="${3:-}"
  local current=""
  if [ -n "$override_env" ] && [ "${!override_env+x}" = x ]; then
    current="${!override_env}"
  fi
  if [ -n "$current" ] && [ "$current" != "$bench_value" ]; then
    if [ "$BENCH_ALLOW_OVERRIDE" = 1 ]; then
      printf -v "$var" '%s' "$current"
      echo "[bench] override $var=$current (bench.yml had $bench_value)" >&2
      return 0
    fi
    echo "$var is set to '$current' but bench.yml requires '$bench_value'." >&2
    echo "Unset it, or set BENCH_ALLOW_OVERRIDE=1 for a local smoke test." >&2
    exit 2
  fi
  printf -v "$var" '%s' "$bench_value"
}

apply_bench_value BUDGET_MIN "$BENCH_BUDGET_MIN" BUDGET_MIN
apply_bench_value BUDGET_WRAPUP_SEC "$BENCH_WRAPUP_SEC" BUDGET_WRAPUP_SEC
apply_bench_value EXPERIMENT_MAX_SEC "$BENCH_EXPERIMENT_MAX_SEC" EXPERIMENT_MAX_SEC
apply_bench_value RUNS_N "$BENCH_TIMED_RUNS" RUNS
apply_bench_value NCPUS "$BENCH_NCPUS" NCPUS
apply_bench_value MEM "$BENCH_MEM" MEM
apply_bench_value SCORED_ROWS "$BENCH_SCORED_ROWS"
apply_bench_value SCORED_DATASET_VOLUME "$BENCH_SCORED_DATASET_VOLUME" SCORED_DATASET_VOLUME
apply_bench_value IMAGE "$BENCH_IMAGE" IMAGE
apply_bench_value WARMUP_RUNS "$BENCH_WARMUP_RUNS"

ROUND="${ROUND_ARG:-$BENCH_ROUND}"
case "$ROUND" in
  A|B) ;;
  *) echo "round must be A or B" >&2; exit 2 ;;
esac

NETWORK_NAME=1brc-agent-net
PROXY_NAME=1brc-proxy
PROXY_IP=172.28.77.2
PROXY_PORT=3128
NO_PROXY_VALUE="localhost,127.0.0.1,$PROXY_IP"

ONEBRC_ROOT="${ONEBRC_ROOT:-$ROOT/../1brc}"
JAVA_GENERATOR="$ROOT/harness/lib/onebrc_generator.sh"
GENERATOR_SOURCE="$ONEBRC_ROOT/src/main/java/dev/morling/onebrc/CreateMeasurements.java"
source "$ROOT/harness/lib/auth.sh"
STAMP="$(date -u +%Y%m%dT%H%M%S)"
RUNDIR="$ROOT/.sessions/${SLUG}-${STAMP}"
mkdir -p "$RUNDIR"
CLEANUP_RUN_ARTIFACTS="${CLEANUP_RUN_ARTIFACTS:-1}"
CLEANUP_SCRIPT="$ROOT/harness/cleanup_run.sh"
CID_FILE="$RUNDIR/container.id"
CID=""
WATCHDOG=""
AGENT_PID=""
CLEANUP_DONE=0

case "$CLEANUP_RUN_ARTIFACTS" in
  0|1) ;;
  *) echo "CLEANUP_RUN_ARTIFACTS must be 0 or 1" >&2; exit 2 ;;
esac

cleanup_session() {
  local status="${1:-0}" cid=""
  [ "$CLEANUP_DONE" -eq 0 ] || return "$status"
  CLEANUP_DONE=1

  if [ -n "${WATCHDOG:-}" ]; then
    kill "$WATCHDOG" 2>/dev/null || true
  fi
  if [ -n "${AGENT_PID:-}" ]; then
    kill "$AGENT_PID" 2>/dev/null || true
  fi
  if [ -r "$CID_FILE" ]; then
    cid="$(tr -d '[:space:]' < "$CID_FILE")"
    if [ -n "$cid" ]; then
      docker rm -f "$cid" >/dev/null 2>&1 || true
    fi
  fi

  if [ "$CLEANUP_RUN_ARTIFACTS" = 1 ]; then
    if [ -x "$CLEANUP_SCRIPT" ]; then
      "$CLEANUP_SCRIPT" "$RUNDIR" || \
        echo "[$SLUG] warning: run-artifact cleanup failed; preserved files remain" >&2
    else
      echo "[$SLUG] warning: missing cleanup helper: $CLEANUP_SCRIPT" >&2
    fi
  else
    echo "[$SLUG] run-artifact cleanup disabled (CLEANUP_RUN_ARTIFACTS=0)" >&2
  fi
  return "$status"
}

cleanup_on_exit() {
  local status=$?
  trap - EXIT
  cleanup_session "$status"
  exit "$status"
}

trap cleanup_on_exit EXIT

case "$BUDGET_MIN" in
  ''|*[!0-9]*) echo "BUDGET_MIN must be a non-negative integer" >&2; exit 2 ;;
esac
case "$BUDGET_WRAPUP_SEC" in
  ''|*[!0-9]*) echo "BUDGET_WRAPUP_SEC must be a non-negative integer" >&2; exit 2 ;;
esac
case "$EXPERIMENT_MAX_SEC" in
  ''|*[!0-9]*|0) echo "EXPERIMENT_MAX_SEC must be a positive integer" >&2; exit 2 ;;
esac

RESOURCE_TOOL="$ROOT/task/tools/resources.py"
BOUNDED_TOOL="$ROOT/task/tools/1brc-bounded"
AGENT_ENTRYPOINT="$ROOT/harness/lib/agent_entrypoint.sh"
SCORE_RUNNER="$ROOT/judge/score_run.py"
SCORED_DATASET_LIB="$ROOT/harness/lib/scored_dataset.sh"
[ -f "$RESOURCE_TOOL" ] || { echo "missing resource tool: $RESOURCE_TOOL" >&2; exit 1; }
[ -f "$BOUNDED_TOOL" ] || { echo "missing bounded-command tool: $BOUNDED_TOOL" >&2; exit 1; }
[ -f "$AGENT_ENTRYPOINT" ] || { echo "missing agent entrypoint: $AGENT_ENTRYPOINT" >&2; exit 1; }
[ -f "$SCORE_RUNNER" ] || { echo "missing score runner: $SCORE_RUNNER" >&2; exit 1; }
[ -f "$SCORED_DATASET_LIB" ] || { echo "missing scored dataset library: $SCORED_DATASET_LIB" >&2; exit 1; }
[ -x "$CLEANUP_SCRIPT" ] || { echo "missing cleanup helper: $CLEANUP_SCRIPT" >&2; exit 1; }

# Validate the profile and credential before spending time and disk space on
# the 1B-row dataset. Profiles may set model identity and auth only.
PROFILE_NCPUS_BEFORE="${NCPUS-}"
PROFILE_MEM_BEFORE="${MEM-}"
unset NCPUS MEM 2>/dev/null || true
set -a; source "$PROFILE"; set +a
if [ "${NCPUS+x}" = x ] || [ "${MEM+x}" = x ]; then
  echo "profile must not set NCPUS or MEM; those come from bench.yml" >&2
  echo "offending profile: $PROFILE" >&2
  exit 2
fi
NCPUS="$PROFILE_NCPUS_BEFORE"
MEM="$PROFILE_MEM_BEFORE"
ADAPTER_ROUTE="${ADAPTER_ROUTE:-pi to $PROVIDER/$MODEL_ID}"
PROFILE_SHA256="$(sha256sum "$PROFILE" | awk '{print $1}')"
PROMPT_SHA256="$(sha256sum "$ROOT/task/program.md" | awk '{print $1}')"
JUDGE_SHA256="$(sha256sum "$ROOT/judge/score.py" | awk '{print $1}')"
JUDGE_RUNNER_SHA256="$(sha256sum "$ROOT/judge/score_run.py" | awk '{print $1}')"
RUNNER_SHA256="$(sha256sum "$ROOT/harness/run_session.sh" | awk '{print $1}')"
BENCH_SHA256="$(sha256sum "$BENCH_FILE" | awk '{print $1}')"
HARNESS_GIT_COMMIT="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || printf unknown)"
if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=normal 2>/dev/null)" ]; then
  HARNESS_GIT_DIRTY=true
else
  HARNESS_GIT_DIRTY=false
fi

if [ -n "$BENCH_PROMPT_SHA256" ] && [ "$PROMPT_SHA256" != "$BENCH_PROMPT_SHA256" ]; then
  if [ "$BENCH_ALLOW_OVERRIDE" = 1 ]; then
    echo "[bench] warning: task/program.md sha256 is $PROMPT_SHA256; bench.yml pins $BENCH_PROMPT_SHA256" >&2
  else
    echo "task/program.md does not match bench.yml prompt_sha256." >&2
    echo "got $PROMPT_SHA256" >&2
    echo "expected $BENCH_PROMPT_SHA256" >&2
    echo "Update bench.yml after intentional prompt changes, or set BENCH_ALLOW_OVERRIDE=1." >&2
    exit 2
  fi
fi

# A Cursor CLI completion can legitimately contain many tool turns. The
# bridge timeout must cover the session's usable budget; the old fixed 900s
# timeout killed otherwise-live Cursor agents and surfaced as an incomplete
# stream to pi. Allow profiles or callers to override it, but otherwise leave
# the wrap-up window for the host-side deadline handoff.
if [ "${CURSOR_PROXY_IN_CONTAINER:-0}" = 1 ]; then
  CURSOR_PROXY_TIMEOUT_MS="${CURSOR_PROXY_TIMEOUT_MS:-$((BUDGET_MIN * 60 * 1000 - BUDGET_WRAPUP_SEC * 1000))}"
  case "$CURSOR_PROXY_TIMEOUT_MS" in
    ''|*[!0-9]*|0) echo "CURSOR_PROXY_TIMEOUT_MS must be a positive integer" >&2; exit 2 ;;
  esac
fi
mkdir -p "$RUNDIR/pi-home"
prepare_auth "$RUNDIR"

# Optional in-container Cursor proxy mode. The proxy package and Cursor CLI
# stay host-owned, while the proxy process and all of Cursor's native tools run
# inside the same constrained container as pi and the final judge.
CONTAINER_EXTRA_ARGS=()
if [ "${CURSOR_PROXY_IN_CONTAINER:-0}" = 1 ]; then
  CURSOR_HOST_NPX_ROOT="${CURSOR_HOST_NPX_ROOT:-}"
  if [ -z "$CURSOR_HOST_NPX_ROOT" ]; then
    cursor_proxy_pkg="$(find "$HOME/.npm/_npx" -type f -path '*/node_modules/cursor-api-proxy/package.json' -printf '%p\n' 2>/dev/null | sort | tail -n 1)"
    [ -n "$cursor_proxy_pkg" ] || {
      echo "could not find the npx cursor-api-proxy package cache" >&2
      exit 1
    }
    CURSOR_HOST_NPX_ROOT="$(dirname "$(dirname "$(dirname "$cursor_proxy_pkg")")")"
  fi
  CURSOR_HOST_AGENT_ROOT="${CURSOR_HOST_AGENT_ROOT:-$HOME/.local/share/cursor-agent}"
  CURSOR_HOST_CURSOR_CONFIG="${CURSOR_HOST_CURSOR_CONFIG:-$HOME/.config/cursor}"
  CURSOR_HOST_AUTH_FILE="${CURSOR_HOST_AUTH_FILE:-$CURSOR_HOST_CURSOR_CONFIG/auth.json}"
  CURSOR_HOST_AGENT_BIN="${CURSOR_HOST_AGENT_BIN:-$HOME/.local/bin/cursor-agent}"

  [ -d "$CURSOR_HOST_NPX_ROOT/node_modules/cursor-api-proxy" ] || {
    echo "cursor-api-proxy npx root is invalid: $CURSOR_HOST_NPX_ROOT" >&2
    exit 1
  }
  [ -d "$CURSOR_HOST_AGENT_ROOT" ] || {
    echo "Cursor agent installation not found: $CURSOR_HOST_AGENT_ROOT" >&2
    exit 1
  }
  [ -d "$CURSOR_HOST_CURSOR_CONFIG" ] || {
    echo "Cursor config directory not found: $CURSOR_HOST_CURSOR_CONFIG" >&2
    exit 1
  }
  [ -f "$CURSOR_HOST_AUTH_FILE" ] || {
    echo "Cursor auth file not found: $CURSOR_HOST_AUTH_FILE" >&2
    exit 1
  }
  command -v jq >/dev/null 2>&1 || {
    echo "jq is required to read the existing Cursor auth token" >&2
    exit 1
  }
  CURSOR_AUTH_TOKEN="$(jq -r '.accessToken // empty' "$CURSOR_HOST_AUTH_FILE")"
  [ -n "$CURSOR_AUTH_TOKEN" ] || {
    echo "Cursor auth file has no access token" >&2
    exit 1
  }
  CURSOR_AGENT_REALPATH="$(readlink -f "$CURSOR_HOST_AGENT_BIN")"
  case "$CURSOR_AGENT_REALPATH" in
    "$CURSOR_HOST_AGENT_ROOT"/*) ;;
    *)
      echo "Cursor agent must resolve under CURSOR_HOST_AGENT_ROOT: $CURSOR_AGENT_REALPATH" >&2
      exit 1
      ;;
  esac
  CURSOR_AGENT_RELATIVE="${CURSOR_AGENT_REALPATH#"$CURSOR_HOST_AGENT_ROOT/"}"
  CURSOR_AGENT_CONTAINER_BIN="/opt/cursor-agent/$CURSOR_AGENT_RELATIVE"
  [ -x "$CURSOR_AGENT_REALPATH" ] || {
    echo "Cursor agent binary is not executable: $CURSOR_AGENT_REALPATH" >&2
    exit 1
  }
  [ -n "${CURSOR_PROXY_API_KEY:-}" ] || {
    echo "CURSOR_PROXY_API_KEY is required for the in-container cursor proxy" >&2
    exit 1
  }
  CONTAINER_EXTRA_ARGS+=(
    -e CURSOR_PROXY_IN_CONTAINER=1
    -e CURSOR_PROXY_MODEL="$MODEL_ID"
    -e CURSOR_PROXY_TIMEOUT_MS="$CURSOR_PROXY_TIMEOUT_MS"
    -e CURSOR_AUTH_TOKEN="$CURSOR_AUTH_TOKEN"
    -e CURSOR_AGENT_BIN="$CURSOR_AGENT_CONTAINER_BIN"
    -v "$CURSOR_HOST_NPX_ROOT:/opt/cursor-npx:ro"
    -v "$CURSOR_HOST_AGENT_ROOT:/opt/cursor-agent:ro"
    -v "$CURSOR_HOST_CURSOR_CONFIG:/opt/cursor-config-source:ro"
  )
fi

# --- image + datasets (the scored volume is prepared/reused before budget) ---
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build -t "$IMAGE" -f "$ROOT/docker/Dockerfile" "$ROOT"
IMAGE_DIGEST="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
if [ -n "$BENCH_IMAGE_DIGEST" ] && [ "$IMAGE_DIGEST" != "$BENCH_IMAGE_DIGEST" ]; then
  if [ "$BENCH_ALLOW_OVERRIDE" = 1 ]; then
    echo "[bench] warning: image digest is $IMAGE_DIGEST; bench.yml pins $BENCH_IMAGE_DIGEST" >&2
  else
    echo "sandbox image digest does not match bench.yml." >&2
    echo "got $IMAGE_DIGEST" >&2
    echo "expected $BENCH_IMAGE_DIGEST" >&2
    echo "Rebuild from the published pin, or set BENCH_ALLOW_OVERRIDE=1 for a local image." >&2
    exit 2
  fi
fi
AGENT_VERSION="$(docker run --rm --network none --entrypoint pi "$IMAGE" --version 2>/dev/null | head -n 1)"
[ -n "$AGENT_VERSION" ] || AGENT_VERSION=unknown
source "$SCORED_DATASET_LIB"
SCORED_DATASET_ROWS="$SCORED_ROWS"
SCORED_DATASET_ROOT="$ROOT"
SCORED_DATASET_GENERATOR="$JAVA_GENERATOR"
SCORED_DATASET_GENERATOR_SOURCE="$GENERATOR_SOURCE"
SCORED_DATASET_IMAGE="$IMAGE"
SCORED_DATASET_ROUND="$ROUND"
SCORED_DATASET_CPUS="$NCPUS"
SCORED_DATASET_MEM="$MEM"
prepare_scored_dataset
GENERATOR_SOURCE_SHA256="$SCORED_DATASET_GENERATOR_SOURCE_SHA256"
EXPECTED_OUTPUT="$SCORED_DATASET_EXPECTED_OUTPUT"
SCORED_CONTAINER_INPUT=/data/measurements.txt

if [ -n "$BENCH_DATASET_SHA256" ] && [ "$SCORED_DATASET_SHA256" != "$BENCH_DATASET_SHA256" ]; then
  if [ "$BENCH_ALLOW_OVERRIDE" = 1 ]; then
    echo "[bench] warning: dataset sha256 is $SCORED_DATASET_SHA256; bench.yml pins $BENCH_DATASET_SHA256" >&2
  else
    echo "scored dataset sha256 does not match bench.yml." >&2
    echo "got $SCORED_DATASET_SHA256" >&2
    echo "expected $BENCH_DATASET_SHA256" >&2
    exit 2
  fi
fi
if [ -n "$BENCH_GENERATOR_SHA256" ] && [ "$GENERATOR_SOURCE_SHA256" != "$BENCH_GENERATOR_SHA256" ]; then
  if [ "$BENCH_ALLOW_OVERRIDE" = 1 ]; then
    echo "[bench] warning: generator sha256 is $GENERATOR_SOURCE_SHA256; bench.yml pins $BENCH_GENERATOR_SHA256" >&2
  else
    echo "generator source sha256 does not match bench.yml." >&2
    echo "got $GENERATOR_SOURCE_SHA256" >&2
    echo "expected $BENCH_GENERATOR_SHA256" >&2
    exit 2
  fi
fi

# The volume is mounted read-only into the agent container, but its file is
# root-owned and mode 0600 until pi exits. This preserves the held-out input
# without regenerating or copying it for each session.
DATA_DIR="$RUNDIR/data"
mkdir -p "$DATA_DIR"
ln -s /score-data/measurements.txt "$DATA_DIR/measurements.txt"

# Development data remains available to the agent as before.
DEV="$ROOT/data/measurements-dev-java.txt"
[ -s "$DEV" ] || bash "$JAVA_GENERATOR" 10000000 "$DEV"
if ! ln "$DEV" "$DATA_DIR/measurements-dev.txt" 2>/dev/null; then
  cp --reflink=auto "$DEV" "$DATA_DIR/measurements-dev.txt"
fi

# /work is bind-mounted over the image's /work — seed the session workdir
# with the rulebook + tools, owned by the in-container agent user (1000).
# (chown via docker so the script works without host sudo.)
mkdir -p "$RUNDIR/work/submission"
mkdir -p "$RUNDIR/lifecycle"
cp "$ROOT/task/program.md" "$RUNDIR/work/program.md"
cp -r "$ROOT/task/tools" "$RUNDIR/work/tools"
cp "$ROOT/judge/reference.py" "$RUNDIR/work/tools/reference.py"
find "$RUNDIR/work/tools" -maxdepth 1 -type f -exec chmod +x {} +
docker run --rm \
  -v "$RUNDIR/work:/w" \
  -v "$RUNDIR/pi-home:/h" \
  -v "$RUNDIR/lifecycle:/l" \
  alpine:latest chown -R 1000:1000 /w /h /l

require_network_ready() {
  docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 \
    || { echo "network missing — run: sudo ./harness/setup_network.sh" >&2; return 1; }

  local internal proxy_running proxy_ip proxy_networks proxy_network_count proxy_label proxy_image
  internal="$(docker network inspect -f '{{.Internal}}' "$NETWORK_NAME")"
  [ "$internal" = true ] \
    || { echo "network $NETWORK_NAME is not internal; rerun setup_network.sh" >&2; return 1; }

  docker inspect "$PROXY_NAME" >/dev/null 2>&1 \
    || { echo "proxy missing — run: sudo ./harness/setup_network.sh" >&2; return 1; }
  proxy_running="$(docker inspect -f '{{.State.Running}}' "$PROXY_NAME")"
  [ "$proxy_running" = true ] \
    || { echo "proxy $PROXY_NAME is not running" >&2; return 1; }
  proxy_label="$(docker inspect -f '{{index .Config.Labels "com.1brc.agents.proxy"}}' "$PROXY_NAME")"
  [ "$proxy_label" = allowlist-v1 ] \
    || { echo "proxy $PROXY_NAME does not have the expected policy label" >&2; return 1; }
  proxy_image="$(docker inspect -f '{{.Config.Image}}' "$PROXY_NAME")"
  [ "$proxy_image" = "$BENCH_PROXY_IMAGE" ] \
    || { echo "proxy $PROXY_NAME uses unexpected image $proxy_image (bench.yml wants $BENCH_PROXY_IMAGE)" >&2; return 1; }
  proxy_ip="$(docker inspect -f '{{(index .NetworkSettings.Networks "1brc-agent-net").IPAddress}}' "$PROXY_NAME")"
  [ "$proxy_ip" = "$PROXY_IP" ] \
    || { echo "proxy IP is $proxy_ip, expected $PROXY_IP" >&2; return 1; }
  proxy_network_count="$(docker inspect -f '{{len .NetworkSettings.Networks}}' "$PROXY_NAME")"
  [ "$proxy_network_count" = 2 ] \
    || { echo "proxy has unexpected network attachments: $proxy_network_count" >&2; return 1; }
  proxy_networks="$(docker inspect -f '{{json .NetworkSettings.Networks}}' "$PROXY_NAME")"
  case "$proxy_networks" in
    *'"bridge":'*) : ;;
    *) echo "proxy is not attached to Docker's bridge network" >&2; return 1 ;;
  esac
}

require_network_ready
PROXY_ALLOW_DOMAINS="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$PROXY_NAME" | sed -n 's/^ALLOW_DOMAINS=//p')"
[ -n "$PROXY_ALLOW_DOMAINS" ] || { echo "proxy has no recorded allowlist" >&2; exit 1; }
PROXY_LOCAL_FORWARD_PORT="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$PROXY_NAME" | sed -n 's/^LOCAL_FORWARD_PORT=//p')"

echo "[$SLUG] starting: budget=${BUDGET_MIN}m round=$ROUND scored_rows=${SCORED_ROWS}"

# --- launch pi headless inside the sandbox ---
GOAL_PROMPT="Read program.md and follow it exactly. Run fully autonomously — never stop, never ask for input, never wait for a human. Goal: make /work/submission/run.sh the fastest CORRECT solution for Round ${ROUND} (${ROUND} is defined in program.md) within your ${BUDGET_MIN}-minute budget. Keep run.sh valid at all times once your first correct version exists.

Authoritative time management: the harness provides the read-only command 1brc-remaining-time. Run it at startup, after each candidate or major measurement batch, and before finalizing. Use its remaining_seconds value; do not estimate the budget from timestamps, tool-call counts, or model reasoning. While remaining_seconds is greater than ${BUDGET_WRAPUP_SEC}, continue optimizing or validating. At or below that threshold, preserve the best known submission and perform final checks. If the command fails, treat the remaining time as unknown and do not claim that the budget is exhausted."
GOAL_PROMPT="$GOAL_PROMPT

Resource management: run 1brc-resources at startup and before choosing a worker count. Tune to effective_cpu_cpus/cpu_quota_cpus and memory_limit_bytes, not nproc, /proc/cpuinfo, or free alone; those can show host capacity rather than the container quota. The requested limits for this session are ${NCPUS} CPU-equivalents and ${MEM} memory.

Do not use sleep to manage the session budget or wait between experiments; query 1brc-remaining-time and keep working instead.

Experiment hygiene: run every candidate benchmark, profiler, or other potentially long command through 1brc-bounded, for example: 1brc-bounded 60s bash /work/submission/run.sh /data/measurements-dev.txt. It kills the whole experiment process group after the deadline. For a multi-step command, put 1brc-bounded around the entire bash -c block; never put it only after an unbounded preparation or run. Do not background experiments or run an unbounded full-file scan; after a failed experiment, verify that no candidate processes remain."

# Round B spec is revealed only in the launch prompt (anti-retrieval)
if [ "$ROUND" = "B" ]; then
  GOAL_PROMPT="$GOAL_PROMPT

Round B task (replaces Round A output): for each station print name=median/stdev where median is the middle value (mean of the two middle values for even counts) and stdev is the population standard deviation. Median rounded half-up to 1 decimal, stdev to 2 decimals (−0.0 normalized to 0.0). Same output envelope: {a=1.0/2.25, b=...}, stations sorted byte-wise."
fi

THINK_ARGS=()
[ -n "${THINKING:-}" ] && THINK_ARGS+=(--thinking "$THINKING")

SESSION_START_EPOCH="$(date +%s)"
deadline=$(( SESSION_START_EPOCH + BUDGET_MIN * 60 ))
CONTROL_DIR="$RUNDIR/control"
LIFECYCLE_DIR="$RUNDIR/lifecycle"
TIME_TOOL="$ROOT/task/tools/remaining_time.py"
[ -f "$TIME_TOOL" ] || { echo "missing remaining-time tool: $TIME_TOOL" >&2; exit 1; }
mkdir -p "$CONTROL_DIR"
printf '{"budget_seconds":%s,"started_epoch":%s,"deadline_epoch":%s,"wrapup_seconds":%s}\n' \
  "$((BUDGET_MIN * 60))" "$SESSION_START_EPOCH" "$deadline" "$BUDGET_WRAPUP_SEC" \
  > "$CONTROL_DIR/budget.json"
chmod 0444 "$CONTROL_DIR/budget.json"
STOP_REASON=agent_exit
CONTAINER_EXIT_STATUS=unknown
STALE_COMMAND_KILLS=0

enforce_agent_command_timeout() {
  local cid="$1" pi_pid stale pid elapsed
  pi_pid="$(docker exec "$cid" pgrep -xo pi 2>/dev/null || true)"
  [ -n "$pi_pid" ] || return 0
  stale="$(docker exec "$cid" ps -eo pid=,ppid=,etimes=,comm= 2>/dev/null \
    | awk -v parent="$pi_pid" -v max="$EXPERIMENT_MAX_SEC" \
      '$2 == parent && $3 > max && $4 != "pi" { print $1 ":" $3 }' || true)"
  while IFS=: read -r pid elapsed; do
    [ -n "$pid" ] || continue
    echo "[$SLUG] stopping unwrapped agent command pid=$pid after ${elapsed}s"
    docker exec "$cid" sh -c '
      target="$1"
      group="$(ps -o pgid= -p "$target" | tr -d " ")"
      owner="$(pgrep -xo pi || true)"
      if [ -n "$group" ] && [ "$group" != 1 ] && [ "$group" != "$owner" ]; then
        /bin/kill -KILL -- "-$group" 2>/dev/null || /bin/kill -KILL "$target" 2>/dev/null || true
      else
        /bin/kill -KILL "$target" 2>/dev/null || true
      fi
    ' sh "$pid" >/dev/null 2>&1 || true
    STALE_COMMAND_KILLS=$((STALE_COMMAND_KILLS + 1))
  done <<< "$stale"
}

( sleep $(( BUDGET_MIN * 60 + 300 )); \
  cid="$(cat "$CID_FILE" 2>/dev/null || true)"; \
  if [ -n "$cid" ]; then \
    docker exec "$cid" sh -c 'pid="$(pgrep -xo pi || true)"; [ -z "$pid" ] || kill -KILL "$pid"' >/dev/null 2>&1 || true; \
    sleep 30; \
    docker kill "$cid" >/dev/null 2>&1 || true; \
  fi \
) &
WATCHDOG=$!

docker run --rm \
  --name "1brc-${SLUG}-${STAMP}" \
  --network "$NETWORK_NAME" \
  --init \
  --cpus="$NCPUS" --memory="$MEM" \
  --cap-add=PERFMON \
  --user 1000:1000 \
  -e HOME=/home/agent \
  -e ONEBRC_CPU_QUOTA="$NCPUS" \
  -e ONEBRC_MEMORY_LIMIT="$MEM" \
  -e HTTPS_PROXY="http://${PROXY_IP}:${PROXY_PORT}" \
  -e HTTP_PROXY="http://${PROXY_IP}:${PROXY_PORT}" \
  -e NO_PROXY="$NO_PROXY_VALUE" \
  "${AUTH_DOCKER_ARGS[@]}" \
  "${CONTAINER_EXTRA_ARGS[@]}" \
  -v "$CONTROL_DIR:/run/1brc-budget:ro" \
  -v "$TIME_TOOL:/usr/local/bin/1brc-remaining-time:ro" \
  -v "$RESOURCE_TOOL:/usr/local/bin/1brc-resources:ro" \
  -v "$BOUNDED_TOOL:/usr/local/bin/1brc-bounded:ro" \
  -v "$AGENT_ENTRYPOINT:/usr/local/bin/1brc-agent-entrypoint:ro" \
  -v "$SCORE_RUNNER:/run/1brc-score-run.py:ro" \
  -v "$LIFECYCLE_DIR:/run/1brc-lifecycle" \
  -v "$SCORED_DATASET_VOLUME:/score-data:ro" \
  -v "$RUNDIR/work:/work" \
  -v "$RUNDIR/pi-home:/home/agent" \
  -v "$DATA_DIR:/data:ro" \
  --entrypoint /usr/local/bin/1brc-agent-entrypoint \
  "$IMAGE" \
  --mode json \
  --provider "$PROVIDER" --model "$MODEL_ID" "${THINK_ARGS[@]}" \
  --name "1brc-${SLUG}" \
  "$GOAL_PROMPT" \
  > "$RUNDIR/events.jsonl" 2> "$RUNDIR/pi.err" &
AGENT_PID=$!

sleep 2
CID="$(docker ps -q --filter "name=1brc-${SLUG}-${STAMP}")"
echo "$CID" > "$CID_FILE"

# --- wait for pi to finish while keeping the container alive for scoring ---
if [ -n "$CID" ]; then
  deadline_signal_sent=0
  while :; do
    if [ -f "$LIFECYCLE_DIR/agent.exit" ]; then
      break
    fi
    if ! docker inspect "$CID" >/dev/null 2>&1; then
      echo "[$SLUG] agent container exited before scoring handoff" >&2
      break
    fi
    NOW=$(date +%s)
    if [ "$NOW" -ge "$deadline" ] && [ "$deadline_signal_sent" -eq 0 ]; then
      echo "[$SLUG] budget elapsed — stopping pi; preserving container for scoring"
      STOP_REASON=budget_deadline
      docker exec "$CID" sh -c \
        'pid="$(pgrep -xo pi || true)"; [ -z "$pid" ] || kill -TERM "$pid"' \
        >/dev/null 2>&1 || true
      deadline_signal_sent=1
    fi
    enforce_agent_command_timeout "$CID"
    if ! kill -0 "$WATCHDOG" 2>/dev/null; then
      : # watchdog already fired
    fi
    sleep 15
  done
else
  echo "[$SLUG] container exited before its id was observed" >&2
fi
kill "$WATCHDOG" 2>/dev/null || true
if [ -r "$LIFECYCLE_DIR/agent.exit" ]; then
  CONTAINER_EXIT_STATUS="$(tr -d '[:space:]' < "$LIFECYCLE_DIR/agent.exit")"
else
  CONTAINER_EXIT_STATUS=unknown
  [ "$STOP_REASON" = agent_exit ] && STOP_REASON=agent_container_exit
fi
if [ "$STOP_REASON" = agent_exit ] && [ "$(date +%s)" -ge "$deadline" ]; then
  STOP_REASON=agent_exit_at_deadline
fi

SESSION_END_EPOCH="$(date +%s)"
AGENT_ELAPSED_SECONDS=$(( SESSION_END_EPOCH - SESSION_START_EPOCH ))

# The held-out volume is unreadable by UID 1000 during the agent phase. Unlock
# only its POSIX read bit after pi exits; the volume mount itself remains
# read-only inside the benchmark container. Disconnect the model/API network
# before executing untrusted submission code.
SCORE_NETWORK_STATUS=not_connected
SCORE_HANDOFF_STATUS=not_available
if [ -n "$CID" ] && docker inspect "$CID" >/dev/null 2>&1; then
  if docker network disconnect "$NETWORK_NAME" "$CID" >/dev/null 2>&1; then
    SCORE_NETWORK_STATUS=disconnected
  else
    SCORE_NETWORK_STATUS=disconnect_failed
    echo "[$SLUG] warning: could not disconnect scoring container from $NETWORK_NAME" >&2
  fi
  if docker run --rm -u 0:0 -v "$SCORED_DATASET_VOLUME:/dataset" \
    alpine:latest chmod 0444 /dataset/measurements.txt >/dev/null 2>&1; then
    SCORE_HANDOFF_STATUS=complete
  else
    SCORE_HANDOFF_STATUS=unlock_failed
    echo "[$SLUG] warning: could not unlock scored dataset volume" >&2
  fi
fi

# --- score inside the same agent container ---
SCORE_STARTED_EPOCH="$(date +%s)"
SCORE_LOG="$RUNDIR/score.log"
echo "[$SLUG] scoring round $ROUND inside the agent container (reference generation, warmup, and ${RUNS_N} timed runs)"
SCORE_EXIT_STATUS=1
set +e
python3 "$ROOT/judge/score.py" \
  --round "$ROUND" \
  --input "$SCORED_CONTAINER_INPUT" \
  --submission "$RUNDIR/work/submission/run.sh" \
  --expected-file "$EXPECTED_OUTPUT" \
  --container "$CID" \
  --container-runner /run/1brc-score-run.py \
  --runs "$RUNS_N" \
  2> >(tee "$SCORE_LOG" >&2) \
  | tee "$RUNDIR/score.json"
SCORE_EXIT_STATUS="${PIPESTATUS[0]}"
set -e
SCORE_ENDED_EPOCH="$(date +%s)"
SCORE_ELAPSED_SECONDS=$(( SCORE_ENDED_EPOCH - SCORE_STARTED_EPOCH ))
if [ "$SCORE_EXIT_STATUS" -eq 0 ]; then
  echo "[$SLUG] scoring complete in ${SCORE_ELAPSED_SECONDS}s"
else
  echo "[$SLUG] scoring failed with exit status $SCORE_EXIT_STATUS after ${SCORE_ELAPSED_SECONDS}s" >&2
fi

# Release the container only after all scoring commands have completed.
touch "$LIFECYCLE_DIR/release"
if ! wait "$AGENT_PID"; then
  [ "$CONTAINER_EXIT_STATUS" = 0 ] && CONTAINER_EXIT_STATUS=agent_wrapper_error
fi
[ -z "$CID" ] || docker rm -f "$CID" >/dev/null 2>&1 || true

# --- manifest ---
{
  echo "slug: $SLUG"
  echo "profile: $PROFILE"
  echo "bench_file: $BENCH_FILE"
  echo "bench_sha256: $BENCH_SHA256"
  echo "bench_allow_override: $BENCH_ALLOW_OVERRIDE"
  echo "round: $ROUND"
  echo "budget_min: $BUDGET_MIN"
  echo "scored_rows: $SCORED_ROWS"
  echo "scored_dataset_volume: $SCORED_DATASET_VOLUME"
  echo "scored_dataset_bytes: $SCORED_DATASET_BYTES"
  echo "scored_dataset_sha256: $SCORED_DATASET_SHA256"
  echo "scored_dataset_reused: $SCORED_DATASET_REUSED"
  echo "expected_output_cache: $EXPECTED_OUTPUT"
  echo "generator: dev.morling.onebrc.CreateMeasurements"
  echo "generator_root: $ONEBRC_ROOT"
  echo "generator_source_sha256: $GENERATOR_SOURCE_SHA256"
  echo "started: $STAMP"
  echo "provider: $PROVIDER"
  echo "model: $MODEL_ID"
  echo "thinking: ${THINKING:-default}"
  echo "adapter_route: \"$ADAPTER_ROUTE\""
  echo "agent_version: \"$AGENT_VERSION\""
  echo "harness_git_commit: $HARNESS_GIT_COMMIT"
  echo "harness_git_dirty: $HARNESS_GIT_DIRTY"
  echo "profile_sha256: $PROFILE_SHA256"
  echo "prompt_sha256: $PROMPT_SHA256"
  echo "judge_sha256: $JUDGE_SHA256"
  echo "judge_runner_sha256: $JUDGE_RUNNER_SHA256"
  echo "runner_sha256: $RUNNER_SHA256"
  echo "network: $NETWORK_NAME"
  echo "proxy_ip: $PROXY_IP"
  echo "proxy_allow_domains: $PROXY_ALLOW_DOMAINS"
  echo "proxy_local_forward_port: $PROXY_LOCAL_FORWARD_PORT"
  echo "cursor_proxy_execution: ${CURSOR_PROXY_IN_CONTAINER:-host}"
  echo "cursor_proxy_timeout_ms: ${CURSOR_PROXY_TIMEOUT_MS:-0}"
  echo "credential_isolation: process-shared"
  echo "image: $IMAGE_DIGEST"
  echo "proxy_image: $(docker image inspect "$BENCH_PROXY_IMAGE" --format '{{.Id}}')"
  echo "host: $(uname -srmo)"
  echo "cpus: $(nproc)"
  echo "requested_cpu_quota: $NCPUS"
  echo "requested_memory_limit: $MEM"
  echo "host_cpu_model: \"$(lscpu | sed -n 's/^Model name:[[:space:]]*//p' | head -n 1)\""
  echo "host_cpu_microcode: \"$(lscpu | sed -n 's/^Microcode version:[[:space:]]*//p' | head -n 1)\""
  echo "warm_cache_policy: ${WARMUP_RUNS}_untimed_warmup_then_${RUNS_N}_timed_runs"
  echo "budget_started_epoch: $SESSION_START_EPOCH"
  echo "budget_deadline_epoch: $deadline"
  echo "budget_wrapup_seconds: $BUDGET_WRAPUP_SEC"
  echo "experiment_max_seconds: $EXPERIMENT_MAX_SEC"
  echo "agent_ended_epoch: $SESSION_END_EPOCH"
  echo "agent_elapsed_seconds: $AGENT_ELAPSED_SECONDS"
  echo "stop_reason: $STOP_REASON"
  echo "container_exit_status: $CONTAINER_EXIT_STATUS"
  echo "stale_command_kills: $STALE_COMMAND_KILLS"
  echo "score_started_epoch: $SCORE_STARTED_EPOCH"
  echo "score_ended_epoch: $SCORE_ENDED_EPOCH"
  echo "score_elapsed_seconds: $SCORE_ELAPSED_SECONDS"
  echo "score_exit_status: $SCORE_EXIT_STATUS"
  echo "score_execution: same_agent_container"
  echo "score_input_handoff: $SCORE_HANDOFF_STATUS"
  echo "score_network: $SCORE_NETWORK_STATUS"
  echo "cleanup_run_artifacts: $CLEANUP_RUN_ARTIFACTS"
} > "$RUNDIR/manifest.yaml"
# The EXIT trap performs this as well on an early failure. Here it runs before
# the completion message so every ordinary session frees its disposable files
# before the command returns to the caller.
cleanup_session 0
trap - EXIT
echo "[$SLUG] done — artifacts in $RUNDIR"
exit "$SCORE_EXIT_STATUS"
