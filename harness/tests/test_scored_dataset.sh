#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="1brc-agents-sandbox:latest"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "scored dataset volume test: skipped (image unavailable)"
  exit 0
fi

TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/1brc-dataset.XXXXXX")"
VOLUME="1brc-dataset-test-$$"
cleanup() {
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
  rm -rf -- "$TEST_DIR"
}
trap cleanup EXIT

source "$ROOT/harness/lib/scored_dataset.sh"
SCORED_DATASET_VOLUME="$VOLUME"
SCORED_DATASET_ROWS=1
SCORED_DATASET_ROOT="$ROOT"
SCORED_DATASET_GENERATOR="$ROOT/harness/tests/fixtures/generate-one.sh"
SCORED_DATASET_GENERATOR_SOURCE="$ROOT/harness/tests/fixtures/generator-source.txt"
SCORED_DATASET_STAGING="$TEST_DIR/staging.txt"
SCORED_DATASET_IMAGE="$IMAGE"
SCORED_DATASET_ROUND=A
SCORED_DATASET_CPUS=1
SCORED_DATASET_MEM=512m
SCORED_DATASET_EXPECTED_OUTPUT="$TEST_DIR/expected.txt"

prepare_scored_dataset
test "$SCORED_DATASET_REUSED" = false
test "$SCORED_DATASET_BYTES" -gt 0
test -s "$SCORED_DATASET_EXPECTED_OUTPUT"
test "$(docker run --rm -v "$VOLUME:/dataset:ro" alpine:latest stat -c %a /dataset/measurements.txt)" = 600

if docker run --rm --user 1000:1000 -v "$VOLUME:/dataset:ro" \
  alpine:latest cat /dataset/measurements.txt >/dev/null 2>&1; then
  echo "agent UID could read locked scored volume" >&2
  exit 1
fi

SCORED_DATASET_EXPECTED_OUTPUT="$TEST_DIR/expected.txt"
SCORED_DATASET_REVALIDATE=1
prepare_scored_dataset
test "$SCORED_DATASET_REUSED" = true
test -s "$SCORED_DATASET_EXPECTED_OUTPUT"
docker run --rm -v "$VOLUME:/dataset" alpine:latest \
  chmod 0444 /dataset/measurements.txt
READBACK="$(docker run --rm --user 1000:1000 -v "$VOLUME:/dataset:ro" \
  alpine:latest cat /dataset/measurements.txt)"
test "$READBACK" = 'A;1.0'

echo "validated dataset volume creation/reuse: ok"
