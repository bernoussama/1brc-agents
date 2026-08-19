#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$ROOT/harness/lib/auth.sh"

TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

# The OAuth branch must not inspect AUTH_ENV at all.
printf '%s\n' '{"openai-codex":{"access":"test"}}' > "$TEST_DIR/auth.json"
docker() { :; }
unset AUTH_ENV AUTH_VAL
AUTH_MODE=file
AUTH_FILE="$TEST_DIR/auth.json"
prepare_auth "$TEST_DIR/file-run"
cmp "$TEST_DIR/auth.json" "$TEST_DIR/file-run/pi-home/.pi/agent/auth.json"
test "$(stat -c '%a' "$TEST_DIR/file-run/pi-home/.pi/agent/auth.json")" = 600
test "${#AUTH_DOCKER_ARGS[@]}" -eq 0

API_KEY=test-api-key
AUTH_MODE=env
AUTH_ENV=API_KEY
prepare_auth "$TEST_DIR/env-run"
test "${AUTH_DOCKER_ARGS[0]}" = -e
test "${AUTH_DOCKER_ARGS[1]}" = API_KEY=test-api-key

echo "auth tests: ok"
