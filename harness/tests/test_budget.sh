#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/1brc-budget.XXXXXX")"
trap 'rm -rf -- "$TEST_DIR"' EXIT

NOW="$(date +%s)"
FUTURE=$((NOW + 120))
printf '{"budget_seconds":120,"started_epoch":%s,"deadline_epoch":%s,"wrapup_seconds":30}\n' \
  "$NOW" "$FUTURE" > "$TEST_DIR/budget.json"

RESULT="$(ONEBRC_BUDGET_FILE="$TEST_DIR/budget.json" python3 "$ROOT/task/tools/remaining_time.py")"
python3 - "$RESULT" <<'PY'
import json
import sys

result = json.loads(sys.argv[1])
assert result["phase"] == "optimize"
assert result["expired"] is False
assert 0 < result["remaining_seconds"] <= 120
assert result["deadline_utc"].endswith("+00:00")
PY

printf '{"budget_seconds":120,"started_epoch":%s,"deadline_epoch":%s,"wrapup_seconds":30}\n' \
  "$((NOW - 120))" "$((NOW - 1))" > "$TEST_DIR/expired.json"
EXPIRED="$(ONEBRC_BUDGET_FILE="$TEST_DIR/expired.json" python3 "$ROOT/task/tools/remaining_time.py")"
python3 - "$EXPIRED" <<'PY'
import json
import sys

result = json.loads(sys.argv[1])
assert result["phase"] == "expired"
assert result["expired"] is True
assert result["remaining_seconds"] == 0.0
PY

if ONEBRC_BUDGET_FILE="$TEST_DIR/missing.json" \
  python3 "$ROOT/task/tools/remaining_time.py" >/dev/null 2>&1; then
  echo "remaining-time must fail when the authoritative file is missing" >&2
  exit 1
fi

bash -n "$ROOT/harness/run_session.sh"
grep -Fq "1brc-remaining-time" "$ROOT/harness/run_session.sh"
grep -Fq "1brc-remaining-time" "$ROOT/task/program.md"

echo "budget tool: ok"
