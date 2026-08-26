#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

bash -n "$ROOT/harness/run_session.sh"
grep -Fq 'ONEBRC_RUN_SESSION_FROZEN' "$ROOT/harness/run_session.sh"
grep -Fq 'ONEBRC_RUN_SESSION_ROOT' "$ROOT/harness/run_session.sh"
grep -Fq 'exec bash "$SNAP" "$@"' "$ROOT/harness/run_session.sh"
# Must not clobber the 1brc checkout path from the environment.
! grep -E 'export ONEBRC_ROOT=' "$ROOT/harness/run_session.sh"
grep -Fq 'run_session.frozen.sh' "$ROOT/harness/run_session.sh"
grep -Fq 'run_session.frozen.sh' "$ROOT/harness/cleanup_run.sh"
# A mid-file comment must not become `VFS / ...` if bash ever resumes at
# the wrong offset after an in-flight edit.
! grep -E '^[[:space:]]*VFS[[:space:]]/' "$ROOT/harness/run_session.sh"

echo "runner snapshot: ok"
