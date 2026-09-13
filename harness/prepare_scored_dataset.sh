#!/usr/bin/env bash
set -euo pipefail

# Prepare the shared validated 1B-row dataset and its round reference cache.
# Usage: prepare_scored_dataset.sh [A|B]
#
# Rows, volume, image, and resource caps come from bench.yml unless
# BENCH_ALLOW_OVERRIDE=1 and the matching env vars are set.

ROUND_ARG="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BENCH_FILE="${BENCH_FILE:-$ROOT/bench.yml}"
BENCH_ALLOW_OVERRIDE="${BENCH_ALLOW_OVERRIDE:-0}"
# shellcheck disable=SC1090
eval "$(python3 "$ROOT/harness/lib/load_bench.py" "$BENCH_FILE")"

apply_bench_value() {
  local var="$1" bench_value="$2" override_env="${3:-}"
  local current=""
  if [ -n "$override_env" ] && [ "${!override_env+x}" = x ]; then
    current="${!override_env}"
  fi
  if [ -n "$current" ] && [ "$current" != "$bench_value" ]; then
    if [ "$BENCH_ALLOW_OVERRIDE" = 1 ]; then
      printf -v "$var" '%s' "$current"
      return 0
    fi
    echo "$var is set to '$current' but bench.yml requires '$bench_value'." >&2
    exit 2
  fi
  printf -v "$var" '%s' "$bench_value"
}

apply_bench_value SCORED_DATASET_VOLUME "$BENCH_SCORED_DATASET_VOLUME" SCORED_DATASET_VOLUME
apply_bench_value SCORED_DATASET_ROWS "$BENCH_SCORED_ROWS"
apply_bench_value SCORED_DATASET_IMAGE "$BENCH_IMAGE" IMAGE
apply_bench_value SCORED_DATASET_CPUS "$BENCH_NCPUS" NCPUS
apply_bench_value SCORED_DATASET_MEM "$BENCH_MEM" MEM

ROUND="${ROUND_ARG:-$BENCH_ROUND}"
ONEBRC_ROOT="${ONEBRC_ROOT:-$ROOT/../1brc}"
SCORED_DATASET_ROOT="$ROOT"
SCORED_DATASET_GENERATOR="$ROOT/harness/lib/onebrc_generator.sh"
SCORED_DATASET_GENERATOR_SOURCE="$ONEBRC_ROOT/src/main/java/dev/morling/onebrc/CreateMeasurements.java"
SCORED_DATASET_ROUND="$ROUND"

case "$ROUND" in
  A|B) ;;
  *) echo "round must be A or B: $ROUND" >&2; exit 2 ;;
esac

source "$ROOT/harness/lib/scored_dataset.sh"
prepare_scored_dataset

printf 'volume=%s\nrows=%s\nbytes=%s\nsha256=%s\nreused=%s\nexpected=%s\n' \
  "$SCORED_DATASET_VOLUME" \
  "$SCORED_DATASET_ROWS" \
  "$SCORED_DATASET_BYTES" \
  "$SCORED_DATASET_SHA256" \
  "$SCORED_DATASET_REUSED" \
  "$SCORED_DATASET_EXPECTED_OUTPUT"
