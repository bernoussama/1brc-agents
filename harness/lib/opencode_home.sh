#!/usr/bin/env bash
# Seed a disposable OpenCode 2 home under the session HOME mount.

seed_opencode_home() {
  local rundir="$1"
  local config_src="${2:-}"
  local plugin_dir="${3:-}"
  local agent_files="${4:-}"
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

  if [ -n "$plugin_dir" ]; then
    [ -d "$plugin_dir" ] || {
      echo "OpenCode plugin directory not found: $plugin_dir" >&2
      return 1
    }
    mkdir -p "$rundir/pi-home/.config/opencode/plugins/opencode-conductor"
    cp -a "$plugin_dir"/. "$rundir/pi-home/.config/opencode/plugins/opencode-conductor/"
  fi

  if [ -n "$agent_files" ]; then
    [ -d "$agent_files" ] || {
      echo "OpenCode agent files directory not found: $agent_files" >&2
      return 1
    }
    mkdir -p "$rundir/work/.opencode/agents"
    cp -a "$agent_files"/. "$rundir/work/.opencode/agents/"
  fi
}
