#!/usr/bin/env bash
set -euo pipefail

# Prepare the shared validated 1B-row dataset and its round reference cache.
# Usage: prepare_scored_dataset.sh [A|B]

ROUND="${1:-A}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ONEBRC_ROOT="${ONEBRC_ROOT:-$ROOT/../1brc}"
SCORED_DATASET_VOLUME="${SCORED_DATASET_VOLUME:-1brc-agents-scored-1b-v1}"
SCORED_DATASET_ROWS=1000000000
SCORED_DATASET_ROOT="$ROOT"
SCORED_DATASET_GENERATOR="$ROOT/harness/lib/onebrc_generator.sh"
SCORED_DATASET_GENERATOR_SOURCE="$ONEBRC_ROOT/src/main/java/dev/morling/onebrc/CreateMeasurements.java"
SCORED_DATASET_IMAGE="${IMAGE:-1brc-agents-sandbox:latest}"
SCORED_DATASET_ROUND="$ROUND"
SCORED_DATASET_CPUS="${NCPUS:-4}"
SCORED_DATASET_MEM="${MEM:-8g}"

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
