#!/usr/bin/env bash
# Seed a disposable OpenCode 2 home under the session HOME mount.

seed_opencode_home() {
  local rundir="$1"
  local config_src="${2:-}"
  [ -n "$config_src" ] || {
    echo "seed_opencode_home: config source is required" >&2
    return 1
  }
  [ -f "$config_src" ] || {
    echo "OpenCode 2 config not found: $config_src" >&2
    return 1
  }
  mkdir -p "$rundir/pi-home/.config/opencode"
  mkdir -p "$rundir/pi-home/.local/share/opencode"
  cp "$config_src" "$rundir/pi-home/.config/opencode/opencode.jsonc"
  chmod 600 "$rundir/pi-home/.config/opencode/opencode.jsonc"
}
