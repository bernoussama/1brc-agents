#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESOURCE_TOOL="$ROOT/sandbox/tools/resources.py"
BOUNDED_TOOL="$ROOT/sandbox/tools/1brc-bounded"

RESULT="$(ONEBRC_CPU_QUOTA=6 ONEBRC_MEMORY_LIMIT=16g python3 "$RESOURCE_TOOL")"
python3 - "$RESULT" <<'PY'
import json
import sys

result = json.loads(sys.argv[1])
assert result["requested_cpu_quota"] == 6.0
assert result["requested_memory_limit"] == "16g"
assert result["requested_memory_limit_bytes"] == 16 * 1024**3
assert result["affinity_cpus"] > 0
assert result["visible_logical_cpus"] > 0
assert result["visible_physical_cores"] > 0
assert result["effective_cpu_cpus"] > 0
assert "memory_limit_bytes" in result
PY

bash -n "$ROOT/harness/run_session.sh" "$BOUNDED_TOOL"
python3 -m py_compile "$RESOURCE_TOOL"

started="$(date +%s)"
if "$BOUNDED_TOOL" 1s bash -c 'sleep 30'; then
  echo "bounded command unexpectedly succeeded" >&2
  exit 1
fi
elapsed=$(( $(date +%s) - started ))
[ "$elapsed" -lt 10 ] || {
  echo "bounded command exceeded its cleanup window: ${elapsed}s" >&2
  exit 1
}

grep -Fq -- "--init" "$ROOT/harness/run_session.sh"
grep -Fq -- "1brc-resources" "$ROOT/harness/run_session.sh"
grep -Fq -- "1brc-bounded" "$ROOT/harness/run_session.sh"
grep -Fq -- "EXPERIMENT_MAX_SEC" "$ROOT/harness/run_session.sh"
grep -Fq -- "stopping unwrapped agent command" "$ROOT/harness/run_session.sh"
grep -Fq -- "1brc-resources" "$ROOT/sandbox/program.md"
grep -Fq -- "1brc-bounded" "$ROOT/sandbox/program.md"

echo "resource telemetry and bounded cleanup: ok"
