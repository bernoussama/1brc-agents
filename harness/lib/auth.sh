#!/usr/bin/env bash

# The sandbox runs as uid 1000. Host-written files under pi-home must match.
chown_session_home() {
  local rundir="$1"
  [ -d "$rundir/pi-home" ] || return 0
  docker run --rm -v "$rundir/pi-home:/h" alpine:latest chown -R 1000:1000 /h
}

# Prepare credentials for the session container.
# Sets AUTH_DOCKER_ARGS for API-key mode and copies auth.json for OAuth mode.
prepare_auth() {
  local rundir="$1"
  AUTH_DOCKER_ARGS=()

  # A profile may provide a non-secret models.json alongside its credential
  # mode. Keep this opt-in so ordinary sessions do not inherit host-side
  # provider configuration or credentials.
  if [ -n "${MODELS_FILE:-}" ]; then
    [ -f "$MODELS_FILE" ] || {
      echo "models file not found at $MODELS_FILE" >&2
      return 1
    }
    mkdir -p "$rundir/pi-home/.pi/agent"
    cp "$MODELS_FILE" "$rundir/pi-home/.pi/agent/models.json"
    chmod 600 "$rundir/pi-home/.pi/agent/models.json"
  fi

  case "${AUTH_MODE:-}" in
    file)
      AUTH_FILE="${AUTH_FILE:-$HOME/.pi/agent/auth.json}"
      [ -f "$AUTH_FILE" ] || { echo "auth file not found at $AUTH_FILE" >&2; return 1; }
      if [ "${AGENT_FRAMEWORK:-pi}" = opencode ]; then
        # OpenCode 2 stores live credentials in SQLite. Copy a db (+ wal/shm)
        # when AUTH_FILE points at opencode.db; otherwise keep a legacy
        # auth.json for first-start import.
        mkdir -p "$rundir/pi-home/.local/share/opencode"
        case "$AUTH_FILE" in
          *.db)
            # A live host `opencode2` server can keep WAL dirty. Checkpoint
            # first; stop the host CLI/server if copy still looks torn.
            if command -v sqlite3 >/dev/null 2>&1; then
              sqlite3 "$AUTH_FILE" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true
            fi
            cp "$AUTH_FILE" "$rundir/pi-home/.local/share/opencode/opencode.db"
            chmod 600 "$rundir/pi-home/.local/share/opencode/opencode.db"
            if [ -f "${AUTH_FILE}-wal" ]; then
              cp "${AUTH_FILE}-wal" "$rundir/pi-home/.local/share/opencode/opencode.db-wal"
              chmod 600 "$rundir/pi-home/.local/share/opencode/opencode.db-wal"
            fi
            if [ -f "${AUTH_FILE}-shm" ]; then
              cp "${AUTH_FILE}-shm" "$rundir/pi-home/.local/share/opencode/opencode.db-shm"
              chmod 600 "$rundir/pi-home/.local/share/opencode/opencode.db-shm"
            fi
            ;;
          *)
            cp "$AUTH_FILE" "$rundir/pi-home/.local/share/opencode/auth.json"
            chmod 600 "$rundir/pi-home/.local/share/opencode/auth.json"
            ;;
        esac
      else
        mkdir -p "$rundir/pi-home/.pi/agent"
        cp "$AUTH_FILE" "$rundir/pi-home/.pi/agent/auth.json"
        chmod 600 "$rundir/pi-home/.pi/agent/auth.json"
      fi
      chown_session_home "$rundir"
      ;;
    env)
      [ -n "${AUTH_ENV:-}" ] || { echo "AUTH_ENV is required when AUTH_MODE=env" >&2; return 1; }
      [[ "$AUTH_ENV" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] \
        || { echo "AUTH_ENV is not a valid environment variable name: $AUTH_ENV" >&2; return 1; }
      AUTH_VAL="${!AUTH_ENV:-}"
      [ -n "$AUTH_VAL" ] || { echo "missing host credential in \$$AUTH_ENV" >&2; return 1; }
      AUTH_DOCKER_ARGS=(-e "${AUTH_ENV}=${AUTH_VAL}")
      ;;
    none)
      # Keyless providers (e.g. OpenCode Zen free models). No host secret is
      # injected; models.json must not send a non-empty Authorization bearer.
      AUTH_DOCKER_ARGS=()
      ;;
    *)
      echo "profile must set AUTH_MODE=file, AUTH_MODE=env, or AUTH_MODE=none" >&2
      return 1
      ;;
  esac

  # Optional extra env credentials, e.g. OPENROUTER_API_KEY alongside Codex
  # OAuth in AUTH_MODE=file. Comma- or space-separated variable names.
  if [ -n "${AUTH_EXTRA_ENVS:-}" ]; then
    local extra_name extra_val
    for extra_name in ${AUTH_EXTRA_ENVS//,/ }; do
      [ -n "$extra_name" ] || continue
      [[ "$extra_name" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] \
        || { echo "AUTH_EXTRA_ENVS contains an invalid name: $extra_name" >&2; return 1; }
      extra_val="${!extra_name:-}"
      [ -n "$extra_val" ] || {
        echo "missing host credential in \$$extra_name (from AUTH_EXTRA_ENVS)" >&2
        return 1
      }
      AUTH_DOCKER_ARGS+=(-e "${extra_name}=${extra_val}")
    done
  fi
}
