#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOAD="$ROOT/harness/lib/load_bench.py"
BENCH="$ROOT/bench.yml"

# Force a known preset so CI hosts that are not the v0.5 laptop still
# exercise the loader end to end. Prefer cloud-agent when this machine
# matches it; otherwise pin laptop.
if python3 "$LOAD" --host cloud-agent "$BENCH" >/dev/null 2>&1 \
  && python3 -c 'import socket; raise SystemExit(0 if socket.gethostname()=="cursor" else 1)'; then
  eval "$(python3 "$LOAD" --host cloud-agent "$BENCH")"
  EXPECT_HOST=cloud-agent
  EXPECT_CPUS=4
  EXPECT_MEM=16g
  EXPECT_CPU_MODEL='Intel(R) Xeon(R) Processor'
  EXPECT_PHYSICAL=4
else
  eval "$(python3 "$LOAD" --host laptop "$BENCH")"
  EXPECT_HOST=laptop
  EXPECT_CPUS=6
  EXPECT_MEM=16g
  EXPECT_CPU_MODEL='Intel Core i7-9750H'
  EXPECT_PHYSICAL=6
fi

[ "$BENCH_VERSION" = 1 ] || { echo "unexpected version: $BENCH_VERSION" >&2; exit 1; }
[ "$BENCH_HOST" = "$EXPECT_HOST" ] || { echo "unexpected host: $BENCH_HOST" >&2; exit 1; }
[ "$BENCH_NCPUS" = "$EXPECT_CPUS" ] || { echo "unexpected cpus: $BENCH_NCPUS" >&2; exit 1; }
[ "$BENCH_MEM" = "$EXPECT_MEM" ] || { echo "unexpected mem: $BENCH_MEM" >&2; exit 1; }
[ "$BENCH_HARDWARE_CPU" = "$EXPECT_CPU_MODEL" ] || {
  echo "unexpected hardware cpu: $BENCH_HARDWARE_CPU" >&2
  exit 1
}
[ "$BENCH_HARDWARE_PHYSICAL_CORES" = "$EXPECT_PHYSICAL" ] || {
  echo "unexpected physical cores: $BENCH_HARDWARE_PHYSICAL_CORES" >&2
  exit 1
}
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
host: broken
hosts:
  broken:
    match: {cpu_contains: nowhere}
    resources: {cpus: 1, memory: potato}
    hardware:
      cpu: x
      physical_cores: 1
      logical_cpus: 1
      storage: x
environment:
  image: x
agent: {name: pi, budget_minutes: 1, wrapup_seconds: 1, experiment_max_seconds: 1}
dataset: {rows: 1, volume: v}
judge: {round: A, warmup_runs: 1, timed_runs: 1, report: median}
YAML
if python3 "$LOAD" --host broken "$BAD" >/dev/null 2>&1; then
  rm -f "$BAD"
  echo "invalid memory should fail" >&2
  exit 1
fi
rm -f "$BAD"

# Explicit cloud-agent preset.
eval "$(python3 "$LOAD" --host cloud-agent "$BENCH")"
[ "$BENCH_HOST" = cloud-agent ] || { echo "cloud-agent host wrong" >&2; exit 1; }
[ "$BENCH_NCPUS" = 4 ] || { echo "cloud-agent cpus wrong: $BENCH_NCPUS" >&2; exit 1; }
[ "$BENCH_MEM" = 16g ] || { echo "cloud-agent mem wrong: $BENCH_MEM" >&2; exit 1; }

# Auto-detect on this Cursor cloud agent VM.
if [ "$(hostname)" = cursor ]; then
  eval "$(python3 "$LOAD" "$BENCH")"
  [ "$BENCH_HOST" = cloud-agent ] || {
    echo "auto should select cloud-agent on hostname=cursor; got $BENCH_HOST" >&2
    exit 1
  }
fi

# Host presets select resources.
TMP="$(mktemp)"
cat > "$TMP" <<'EOF'
version: 1
host: auto
hosts:
  small:
    match:
      cpu_contains: TinyCPU
    resources:
      cpus: 2
      memory: 8GiB
    hardware:
      cpu: TinyCPU
      physical_cores: 2
      logical_cpus: 4
      storage: tiny-disk
  large:
    match:
      cpu_contains: HugeCPU
    resources:
      cpus: 16
      memory: 64GiB
    hardware:
      cpu: HugeCPU
      physical_cores: 16
      logical_cpus: 32
      storage: huge-disk
environment:
  image: 1brc-agents-sandbox:latest
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

eval "$(python3 "$LOAD" --host large "$TMP")"
[ "$BENCH_HOST" = large ] || { echo "fixture host wrong: $BENCH_HOST" >&2; exit 1; }
[ "$BENCH_NCPUS" = 16 ] || { echo "fixture cpus wrong" >&2; exit 1; }
[ "$BENCH_MEM" = 64g ] || { echo "fixture mem wrong: $BENCH_MEM" >&2; exit 1; }
[ "$BENCH_HARDWARE_STORAGE" = huge-disk ] || {
  echo "fixture storage wrong: $BENCH_HARDWARE_STORAGE" >&2
  exit 1
}
[ "$BENCH_ROUND" = B ] || { echo "fixture round wrong" >&2; exit 1; }

# Unknown host name fails.
if python3 "$LOAD" --host missing "$TMP" >/dev/null 2>&1; then
  rm -f "$TMP"
  echo "unknown host should fail" >&2
  exit 1
fi

# environment.resources is rejected.
cat > "$TMP" <<'EOF'
version: 1
host: only
hosts:
  only:
    match: {cpu_contains: x}
    resources: {cpus: 1, memory: 1GiB}
    hardware: {cpu: x, physical_cores: 1, logical_cpus: 1, storage: x}
environment:
  image: x
  resources: {cpus: 9, memory: 9GiB}
agent: {name: pi, budget_minutes: 1, wrapup_seconds: 1, experiment_max_seconds: 1}
dataset: {rows: 1, volume: v}
judge: {round: A, warmup_runs: 1, timed_runs: 1, report: median}
EOF
if python3 "$LOAD" --host only "$TMP" >/dev/null 2>&1; then
  rm -f "$TMP"
  echo "legacy environment.resources should fail" >&2
  exit 1
fi
rm -f "$TMP"

echo "bench loader: ok"
