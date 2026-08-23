#!/bin/sh
# Keep the agent container alive after pi exits so the final submission can be
# scored in the exact image/filesystem/toolchain that produced it.
set -u

status=0
cursor_proxy_pid=""

start_cursor_proxy() {
  [ "${CURSOR_PROXY_IN_CONTAINER:-0}" = 1 ] || return 0

  : "${CURSOR_PROXY_MODEL:?CURSOR_PROXY_MODEL is required for the in-container cursor proxy}"
  : "${CURSOR_AGENT_BIN:?CURSOR_AGENT_BIN is required for the in-container cursor proxy}"
  : "${CURSOR_AUTH_TOKEN:?CURSOR_AUTH_TOKEN is required for the in-container cursor proxy}"

  # Cursor updates its CLI profile while running. Keep the host-mounted
  # credentials read-only and give this disposable container its own copy.
  rm -rf /tmp/cursor-config
  mkdir -p /tmp/cursor-config
  cp -a /opt/cursor-config-source/. /tmp/cursor-config/

  # run_session supplies a budget-sized value; retain a generous fallback
  # for direct entrypoint smoke tests so they do not recreate the old 15m
  # cutoff.
  : > /work/cursor-api-proxy.log
  (
    cd /opt/cursor-npx || exit 1
    CURSOR_CONFIG_DIRS=/tmp/cursor-config \
    CURSOR_BRIDGE_API_KEY="${CURSOR_PROXY_API_KEY:-}" \
    CURSOR_BRIDGE_HOST=127.0.0.1 \
    CURSOR_BRIDGE_PORT=8765 \
    CURSOR_BRIDGE_WORKSPACE=/work \
    CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=false \
    CURSOR_BRIDGE_MODE=agent \
    CURSOR_BRIDGE_FORCE=true \
    CURSOR_BRIDGE_TIMEOUT_MS="${CURSOR_PROXY_TIMEOUT_MS:-3600000}" \
    CURSOR_BRIDGE_DEFAULT_MODEL="$CURSOR_PROXY_MODEL" \
    CURSOR_AGENT_BIN="$CURSOR_AGENT_BIN" \
    npx --offline --no-install cursor-api-proxy --mode agent
  ) >> /work/cursor-api-proxy.log 2>&1 &
  cursor_proxy_pid=$!

  i=0
  while [ "$i" -lt 60 ]; do
    if curl -fsS --max-time 2 http://127.0.0.1:8765/healthz >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$cursor_proxy_pid" 2>/dev/null; then
      echo "in-container cursor-api-proxy exited during startup" >&2
      sed -n '1,160p' /work/cursor-api-proxy.log >&2 || true
      return 1
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "in-container cursor-api-proxy did not become ready" >&2
  sed -n '1,160p' /work/cursor-api-proxy.log >&2 || true
  return 1
}

stop_cursor_proxy() {
  if [ -n "$cursor_proxy_pid" ]; then
    kill "$cursor_proxy_pid" 2>/dev/null || true
    wait "$cursor_proxy_pid" 2>/dev/null || true
  fi
}

if ! start_cursor_proxy; then
  status=1
else
  pi "$@" || status=$?
fi
stop_cursor_proxy

printf '%s\n' "$status" > /run/1brc-lifecycle/agent.exit

# The host injects the held-out scored input and runs the judge through
# docker exec before releasing this container.
while [ ! -e /run/1brc-lifecycle/release ]; do
  sleep 1
done

exit "$status"
