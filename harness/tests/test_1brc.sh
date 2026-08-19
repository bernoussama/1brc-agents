#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ONEBRC_ROOT="${ONEBRC_ROOT:-$ROOT/../1brc}"
SAMPLES="$ONEBRC_ROOT/src/test/resources/samples"
SUBMISSION="${1:-}"

if [ "$#" -gt 1 ]; then
  echo "usage: test_1brc.sh [submission-run.sh]" >&2
  exit 2
fi

[ -d "$SAMPLES" ] || {
  echo "1BRC sample directory not found: $SAMPLES" >&2
  echo "set ONEBRC_ROOT to the 1brc checkout" >&2
  exit 1
}

if [ -n "$SUBMISSION" ]; then
  [ -f "$SUBMISSION" ] || { echo "submission not found: $SUBMISSION" >&2; exit 1; }
fi

TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/1brc-tests.XXXXXX")"
trap 'rm -rf -- "$TEST_DIR"' EXIT

# Exercise the same Java generator used by run_session.sh without creating a
# large dataset. The helper writes atomically, so an interrupted run cannot
# leave a partial destination file behind.
GENERATED="$TEST_DIR/generated.txt"
bash "$ROOT/harness/lib/onebrc_generator.sh" 1000 "$GENERATED" >/dev/null
test "$(wc -l < "$GENERATED")" -eq 1000
python3 "$ROOT/judge/reference.py" "$GENERATED" > "$TEST_DIR/generated.out"
test -s "$TEST_DIR/generated.out"

for sample in "$SAMPLES"/*.txt; do
  expected="${sample%.txt}.out"
  actual="$TEST_DIR/$(basename "$sample").actual"

  if [ -n "$SUBMISSION" ]; then
    bash "$SUBMISSION" "$sample" > "$actual"
  else
    python3 "$ROOT/judge/reference.py" "$sample" > "$actual"
  fi

  # The benchmark scorer ignores trailing newlines, matching the original
  # test scripts' presentation-independent comparison.
  if [ "$(cat "$actual")" != "$(cat "$expected")" ]; then
    echo "FAILED: $(basename "$sample")" >&2
    diff -u "$expected" "$actual" >&2 || true
    exit 1
  fi
  echo "PASS: $(basename "$sample")"
done

if [ -n "$SUBMISSION" ]; then
  echo "1BRC Java generator + sibling samples: submission passed"
else
  echo "1BRC Java generator + sibling samples: reference passed"
fi
