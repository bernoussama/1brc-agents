#!/usr/bin/env bash
# Remove disposable files from one completed session directory.
#
# This deliberately preserves the trace, submission/work tree, score files,
# manifest, budget metadata, and any reports or expected-output snapshots.
# The target must be one direct child of this repository's .sessions/ directory.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: cleanup_run.sh <.sessions/session-directory>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SESSIONS_ROOT="$ROOT/.sessions"
TARGET_ARG="$1"

[ -d "$TARGET_ARG" ] || {
  echo "session directory does not exist: $TARGET_ARG" >&2
  exit 1
}

TARGET="$(cd "$TARGET_ARG" && pwd -P)"
[ "$TARGET" != "$SESSIONS_ROOT" ] || {
  echo "refusing to clean the .sessions root itself" >&2
  exit 1
}
[ "$(dirname "$TARGET")" = "$SESSIONS_ROOT" ] || {
  echo "session directory must be a direct child of $SESSIONS_ROOT: $TARGET" >&2
  exit 1
}

LOG="$TARGET/cleanup.log"
removed_bytes=0

{
  printf 'cleanup_version=1\n'
  printf 'run_directory=%s\n' "$TARGET"
  printf 'started_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  remove_path() {
    local relative="$1" path="$TARGET/$1" bytes
    if [ ! -e "$path" ] && [ ! -L "$path" ]; then
      return 0
    fi
    bytes="$(du -s -B1 -- "$path" 2>/dev/null | awk '{print $1}')"
    bytes="${bytes:-0}"
    printf 'removed=%s bytes=%s\n' "$relative" "$bytes"
    rm -rf -- "$path"
    removed_bytes=$((removed_bytes + bytes))
  }

  # Current-run transient mounts and handoff state.
  remove_path data
  remove_path lifecycle
  remove_path pi-home
  remove_path container.id

  # Compatibility cleanup for sessions created before the persistent scored
  # Docker volume was introduced. The current runner never creates this file.
  remove_path measurements.txt
  remove_path measurements-dev.txt

  printf 'removed_bytes=%s\n' "$removed_bytes"
  printf 'preserved=events.jsonl pi.err work control score.json score.log manifest.yaml reports expected-output snapshots run_session.frozen.sh\n'
  printf 'finished_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$LOG"

printf 'cleaned %s; removed %s bytes; preserved trace/work/score/manifest/log artifacts\n' \
  "$TARGET" "$removed_bytes" >&2
