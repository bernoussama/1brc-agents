#!/usr/bin/env bash
# Probe helpers for the sandbox OpenCode 2 binary.

opencode2_version_ok() {
  local probed="${1:-}"
  local pinned="${2:-}"
  if [ -n "$pinned" ] && printf '%s\n' "$probed" | grep -Fq -- "$pinned"; then
    return 0
  fi
  case "$probed" in
    opencode2|opencode2\ *|*OpenCode\ 2*|v2.*|2.[0-9]*)
      return 0
      ;;
  esac
  return 1
}

opencode2_version_is_v1() {
  local probed="${1:-}"
  case "$probed" in
    v1.*|1.[0-9]*|opencode\ v1.*|opencode\ 1.[0-9]*)
      return 0
      ;;
  esac
  return 1
}
