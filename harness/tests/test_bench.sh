#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOAD="$ROOT/harness/lib/load_bench.py"
BENCH="$ROOT/bench.yml"

eval "$(python3 "$LOAD" "$BENCH")"

[ "$BENCH_VERSION" = 1 ] || { echo "unexpected version: $BENCH_VERSION" >&2; exit 1; }
[ "$BENCH_NCPUS" = 6 ] || { echo "unexpected cpus: $BENCH_NCPUS" >&2; exit 1; }
[ "$BENCH_MEM" = 16g ] || { echo "unexpected mem: $BENCH_MEM" >&2; exit 1; }
[ "$BENCH_BUDGET_MIN" = 120 ] || { echo "unexpected budget: $BENCH_BUDGET_MIN" >&2; exit 1; }
[ "$BENCH_TIMED_RUNS" = 5 ] || { echo "unexpected timed runs: $BENCH_TIMED_RUNS" >&2; exit 1; }
[ "$BENCH_ROUND" = A ] || { echo "unexpected round: $BENCH_ROUND" >&2; exit 1; }
[ "$BENCH_SCORED_ROWS" = 1000000000 ] || { echo "unexpected rows: $BENCH_SCORED_ROWS" >&2; exit 1; }
[ -n "$BENCH_IMAGE_DIGEST" ] || { echo "missing image digest" >&2; exit 1; }
[ -n "$BENCH_PROMPT_SHA256" ] || { echo "missing prompt sha" >&2; exit 1; }

PROMPT_SHA256="$(sha256sum "$ROOT/task/program.md" | awk '{print $1}')"
[ "$PROMPT_SHA256" = "$BENCH_PROMPT_SHA256" ] || {
  echo "bench.yml prompt_sha256 does not match task/program.md" >&2
  exit 1
}

# Profiles must not set resource caps.
while IFS= read -r profile; do
  if grep -E '^(NCPUS|MEM)=' "$profile" >/dev/null; then
    echo "profile still sets resources: $profile" >&2
    exit 1
  fi
done < <(find "$ROOT/harness/profiles" -name '*.sh' | sort)

# Reject invalid memory units.
BAD="$(mktemp)"
cat > "$BAD" <<'YAML'
version: 1
environment:
  image: x
  resources: {cpus: 1, memory: potato}
agent: {name: pi, budget_minutes: 1, wrapup_seconds: 1, experiment_max_seconds: 1}
dataset: {rows: 1, volume: v}
judge: {round: A, warmup_runs: 1, timed_runs: 1, report: median}
YAML
if python3 "$LOAD" "$BAD" >/dev/null 2>&1; then
  rm -f "$BAD"
  echo "invalid memory should fail" >&2
  exit 1
fi
rm -f "$BAD"

# Confirm override rejection path in run_session argument parsing via a dry load.
TMP="$(mktemp)"
cat > "$TMP" <<EOF
version: 1
environment:
  image: 1brc-agents-sandbox:latest
  resources:
    cpus: 2
    memory: 8GiB
agent:
  name: pi
  budget_minutes: 10
  wrapup_seconds: 60
  experiment_max_seconds: 30
dataset:
  rows: 1000
  volume: test-volume
judge:
  round: B
  warmup_runs: 1
  timed_runs: 3
  report: median
EOF
eval "$(python3 "$LOAD" "$TMP")"
[ "$BENCH_NCPUS" = 2 ] || { echo "fixture cpus wrong" >&2; exit 1; }
[ "$BENCH_MEM" = 8g ] || { echo "fixture mem wrong: $BENCH_MEM" >&2; exit 1; }
[ "$BENCH_ROUND" = B ] || { echo "fixture round wrong" >&2; exit 1; }
rm -f "$TMP"

echo "bench loader: ok"
