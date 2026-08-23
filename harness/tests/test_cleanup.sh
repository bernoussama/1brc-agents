#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$ROOT/.sessions"
TEST_DIR="$(mktemp -d "$ROOT/.sessions/.cleanup-test.XXXXXX")"
cleanup() {
  rm -rf -- "$TEST_DIR"
}
trap cleanup EXIT

mkdir -p "$TEST_DIR"/{data,lifecycle,pi-home,control,work}
printf 'disposable\n' > "$TEST_DIR/data/measurements.txt"
printf 'secret\n' > "$TEST_DIR/pi-home/auth.json"
printf 'old scored input\n' > "$TEST_DIR/measurements.txt"
printf '{}\n' > "$TEST_DIR/events.jsonl"
printf 'submission\n' > "$TEST_DIR/work/run.sh"
printf 'budget\n' > "$TEST_DIR/control/budget.json"
printf 'manifest\n' > "$TEST_DIR/manifest.yaml"

bash "$ROOT/harness/cleanup_run.sh" "$TEST_DIR"

test -f "$TEST_DIR/cleanup.log"
test -f "$TEST_DIR/events.jsonl"
test -f "$TEST_DIR/work/run.sh"
test -f "$TEST_DIR/control/budget.json"
test -f "$TEST_DIR/manifest.yaml"
test ! -e "$TEST_DIR/data"
test ! -e "$TEST_DIR/lifecycle"
test ! -e "$TEST_DIR/pi-home"
test ! -e "$TEST_DIR/measurements.txt"
grep -Fq 'removed=measurements.txt' "$TEST_DIR/cleanup.log"
grep -Fq 'preserved=events.jsonl' "$TEST_DIR/cleanup.log"

echo "run artifact cleanup: ok"
