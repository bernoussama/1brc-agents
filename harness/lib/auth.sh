#!/usr/bin/env bash

# Prepare credentials for the session container.
# Sets AUTH_DOCKER_ARGS for API-key mode and copies auth.json for OAuth mode.
prepare_auth() {
  local rundir="$1"
  AUTH_DOCKER_ARGS=()

  case "${AUTH_MODE:-}" in
    file)
      AUTH_FILE="${AUTH_FILE:-$HOME/.pi/agent/auth.json}"
      [ -f "$AUTH_FILE" ] || { echo "auth file not found at $AUTH_FILE" >&2; return 1; }
      mkdir -p "$rundir/pi-home/.pi/agent"
      cp "$AUTH_FILE" "$rundir/pi-home/.pi/agent/auth.json"
      chmod 600 "$rundir/pi-home/.pi/agent/auth.json"
      docker run --rm -v "$rundir/pi-home:/h" alpine:latest chown -R 1000:1000 /h
      ;;
    env)
      [ -n "${AUTH_ENV:-}" ] || { echo "AUTH_ENV is required when AUTH_MODE=env" >&2; return 1; }
      [[ "$AUTH_ENV" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] \
        || { echo "AUTH_ENV is not a valid environment variable name: $AUTH_ENV" >&2; return 1; }
      AUTH_VAL="${!AUTH_ENV:-}"
      [ -n "$AUTH_VAL" ] || { echo "missing host credential in \$$AUTH_ENV" >&2; return 1; }
      AUTH_DOCKER_ARGS=(-e "${AUTH_ENV}=${AUTH_VAL}")
      ;;
    *)
      echo "profile must set AUTH_MODE=file or AUTH_MODE=env" >&2
      return 1
      ;;
  esac
}
