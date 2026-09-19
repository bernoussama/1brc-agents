#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

bash -n \
  "$ROOT/harness/run_session.sh" \
  "$ROOT/harness/lib/agent_entrypoint.sh" \
  "$ROOT/harness/lib/opencode_home.sh" \
  "$ROOT/harness/lib/opencode_version.sh" \
  "$ROOT/harness/profiles/opencode-cli-ox-alpha.sh" \
  "$ROOT/harness/profiles/opencode-cli-hy3-free-high.sh" \
  "$ROOT/harness/profiles/opencode-cli-muse-spark-free-xhigh.sh" \
  "$ROOT/harness/profiles/opencode-cli-gpt-5.6-sol-high.sh" \
  "$ROOT/harness/profiles/opencode-cli-gpt-5.6-sol-high-conductor.sh"

grep -Fq models.dev "$ROOT/harness/setup_network.sh"
grep -Fq OPENCODE_MODELS_FETCH "$ROOT/harness/run_session.sh"
grep -Fq chown_session_home "$ROOT/harness/run_session.sh"
grep -Fq printenv "$ROOT/harness/run_session.sh"
grep -Fq 'ln -sfn agent.err' "$ROOT/harness/run_session.sh"
grep -Fq stop_cursor_proxy "$ROOT/harness/lib/agent_entrypoint.sh"
grep -Fq -- '--agent' "$ROOT/harness/run_session.sh"
grep -Fq AUTH_EXTRA_ENVS "$ROOT/harness/lib/auth.sh"
# Do not use a substring v1 gate that matches 2.1.18.x.
! grep -Fq '*1.18.*' "$ROOT/harness/run_session.sh"

# Native OpenCode 2 launch argv, not the v1 CLI.
grep -Fq -- 'run --standalone' "$ROOT/harness/run_session.sh"
grep -Fq -- 'opencode2' "$ROOT/harness/lib/agent_entrypoint.sh"
grep -Fq -- 'AGENT_FRAMEWORK' "$ROOT/harness/lib/agent_entrypoint.sh"
grep -Fq 'agent_framework:' "$ROOT/harness/run_session.sh"

# Seeded config is native V2 (permissions/shell), not V1 permission/bash.
python3 - "$ROOT/harness/lib/opencode.v2.jsonc" <<'PY'
import json
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8")
assert '"permission"' not in text or '"permissions"' in text
assert "bash" not in text
cfg = json.loads(text)
assert "permissions" in cfg
actions = {row["action"] for row in cfg["permissions"]}
assert "shell" in actions
assert "question" in actions
assert "external_directory" in actions
assert cfg["update"] == "disable"
assert cfg["share"] == "disabled"
PY

python3 - "$ROOT/harness/lib/opencode.conductor.jsonc" <<'PY'
import json
import sys
from pathlib import Path

cfg = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert cfg["default_agent"] == "conductor"
assert cfg["plugins"][0]["package"] == "./plugins/opencode-conductor"
opts = cfg["plugins"][0]["options"]
assert opts["conductorModel"] == "openai/gpt-5.6-sol#high"
assert opts["workerModel"] == "openrouter/deepseek/deepseek-v4.1-flash#max"
assert ":floor" not in opts["workerModel"]
assert ":floor" not in opts["workerFallbackModel"]
assert opts["enableQuestion"] is False
actions = {row["action"] for row in cfg["permissions"]}
assert "subagent" in actions
assert "question" in actions
PY

TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
# shellcheck disable=SC1091
source "$ROOT/harness/lib/opencode_home.sh"
source "$ROOT/harness/lib/opencode_version.sh"
seed_opencode_home "$TEST_DIR" "$ROOT/harness/lib/opencode.v2.jsonc"
test -f "$TEST_DIR/pi-home/.config/opencode/opencode.jsonc"
test "$(stat -c '%a' "$TEST_DIR/pi-home/.config/opencode/opencode.jsonc")" = 600

CONDUCTOR_SEED="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR" "$CONDUCTOR_SEED"' EXIT
seed_opencode_home "$CONDUCTOR_SEED" "$ROOT/harness/lib/opencode.conductor.jsonc" \
  "$ROOT/harness/lib/opencode-conductor" \
  "$ROOT/harness/lib/opencode.conductor.agents"
test -f "$CONDUCTOR_SEED/pi-home/.config/opencode/plugins/opencode-conductor/src/index.ts"
test -f "$CONDUCTOR_SEED/work/.opencode/agents/conductor.md"
grep -Fq 'openai/gpt-5.6-sol#high' "$CONDUCTOR_SEED/work/.opencode/agents/conductor.md"
grep -Fq 'background false' "$CONDUCTOR_SEED/work/.opencode/agents/conductor.md"
grep -Fq 'deepseek-v4.1-flash#max' "$CONDUCTOR_SEED/work/.opencode/agents/conductor/coder.md"

opencode2_version_ok "opencode2 v0.0.0-beta-19271" "0.0.0-beta-19271"
opencode2_version_ok "0.0.0-beta-19271" "0.0.0-beta-19271"
opencode2_version_ok "2.0.1" ""
! opencode2_version_ok "unknown" ""
! opencode2_version_is_v1 "opencode2 v0.0.0-beta-19271"
! opencode2_version_is_v1 "2.1.18"
opencode2_version_is_v1 "1.18.2"
opencode2_version_is_v1 "v1.0.0"

for profile in \
  "$ROOT/harness/profiles/opencode-cli-ox-alpha.sh" \
  "$ROOT/harness/profiles/opencode-cli-hy3-free-high.sh" \
  "$ROOT/harness/profiles/opencode-cli-muse-spark-free-xhigh.sh"
do
  AGENT_FRAMEWORK=""
  # shellcheck disable=SC1090
  source "$profile"
  [ "$AGENT_FRAMEWORK" = opencode ] || {
    echo "profile must set AGENT_FRAMEWORK=opencode: $profile" >&2
    exit 1
  }
  [ "$AUTH_MODE" = none ] || {
    echo "native OpenCode 2 Zen profiles are AUTH_MODE=none: $profile" >&2
    exit 1
  }
done

# Codex/ChatGPT subscription uses the OpenCode SQLite store, not AUTH_MODE=none.
unset AGENT_FRAMEWORK AUTH_MODE AUTH_FILE OPENCODE_MODELS_FETCH PROVIDER MODEL_ID THINKING
# shellcheck disable=SC1091
source "$ROOT/harness/profiles/opencode-cli-gpt-5.6-sol-high.sh"
[ "$AGENT_FRAMEWORK" = opencode ] || {
  echo "Codex Sol-high profile must set AGENT_FRAMEWORK=opencode" >&2
  exit 1
}
[ "$AUTH_MODE" = file ] || {
  echo "Codex Sol-high profile must use AUTH_MODE=file" >&2
  exit 1
}
[ "$OPENCODE_MODELS_FETCH" = 1 ] || {
  echo "Codex Sol-high profile must enable models.dev fetch" >&2
  exit 1
}
[ "$PROVIDER" = openai ] || {
  echo "Codex Sol-high profile must use PROVIDER=openai" >&2
  exit 1
}
[ "$MODEL_ID" = gpt-5.6-sol ] || {
  echo "Codex Sol-high profile must use MODEL_ID=gpt-5.6-sol" >&2
  exit 1
}
[ "$THINKING" = high ] || {
  echo "Codex Sol-high profile must use THINKING=high" >&2
  exit 1
}

unset AGENT_FRAMEWORK AUTH_MODE AUTH_FILE AUTH_EXTRA_ENVS OPENCODE_MODELS_FETCH \
  PROVIDER MODEL_ID THINKING OPENCODE_AGENT OPENCODE_CONFIG OPENCODE_PLUGIN_DIR OPENCODE_AGENT_FILES
# shellcheck disable=SC1091
source "$ROOT/harness/profiles/opencode-cli-gpt-5.6-sol-high-conductor.sh"
[ "$AGENT_FRAMEWORK" = opencode ] || {
  echo "conductor profile must set AGENT_FRAMEWORK=opencode" >&2
  exit 1
}
[ "$OPENCODE_AGENT" = conductor ] || {
  echo "conductor profile must set OPENCODE_AGENT=conductor" >&2
  exit 1
}
[ "$AUTH_MODE" = file ] || {
  echo "conductor profile must use AUTH_MODE=file" >&2
  exit 1
}
[ "$AUTH_EXTRA_ENVS" = OPENROUTER_API_KEY ] || {
  echo "conductor profile must request OPENROUTER_API_KEY" >&2
  exit 1
}
[ -f "$OPENCODE_CONFIG" ] || {
  echo "conductor profile OPENCODE_CONFIG missing: $OPENCODE_CONFIG" >&2
  exit 1
}
[ -d "$OPENCODE_PLUGIN_DIR" ] || {
  echo "conductor profile OPENCODE_PLUGIN_DIR missing: $OPENCODE_PLUGIN_DIR" >&2
  exit 1
}
[ -d "$OPENCODE_AGENT_FILES" ] || {
  echo "conductor profile OPENCODE_AGENT_FILES missing: $OPENCODE_AGENT_FILES" >&2
  exit 1
}

# Existing pi-to-Zen profiles must stay on pi.
unset AGENT_FRAMEWORK
# shellcheck disable=SC1091
source "$ROOT/harness/profiles/opencode-ox-alpha.sh"
[ "${AGENT_FRAMEWORK:-pi}" = pi ] || {
  echo "pi-to-Zen profile must not switch AGENT_FRAMEWORK" >&2
  exit 1
}

ENTRY_TEST="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR" "$CONDUCTOR_SEED" "$ENTRY_TEST"' EXIT
mkdir -p "$ENTRY_TEST/bin" "$ENTRY_TEST/lifecycle"
cat > "$ENTRY_TEST/bin/opencode2" <<EOF
#!/bin/sh
printf 'opencode2-stub:%s\n' "\$*" > "$ENTRY_TEST/opencode2.args"
printf '%s\n' "\$@"
exit 0
EOF
chmod +x "$ENTRY_TEST/bin/opencode2"
cat > "$ENTRY_TEST/bin/pi" <<'EOF'
#!/bin/sh
echo "pi stub should not run" >&2
exit 1
EOF
chmod +x "$ENTRY_TEST/bin/pi"

# Bind the lifecycle paths the entrypoint hardcodes by running it under a
# fake /run via a copied wrapper when we cannot write /run. Instead, invoke
# the dispatch function by executing a trimmed copy that uses a test lifecycle.
sed \
  -e "s|/run/1brc-lifecycle|$ENTRY_TEST/lifecycle|g" \
  "$ROOT/harness/lib/agent_entrypoint.sh" > "$ENTRY_TEST/entrypoint.sh"
chmod +x "$ENTRY_TEST/entrypoint.sh"
touch "$ENTRY_TEST/lifecycle/release"
PATH="$ENTRY_TEST/bin:$PATH" AGENT_FRAMEWORK=opencode \
  "$ENTRY_TEST/entrypoint.sh" run --standalone --format json --auto -m opencode/x-preview-f-free#max "goal" \
  >"$ENTRY_TEST/out" 2>"$ENTRY_TEST/err"
test "$(cat "$ENTRY_TEST/lifecycle/agent.exit")" = 0
grep -Fq -- 'run --standalone' "$ENTRY_TEST/opencode2.args"
grep -Fq -- '-m opencode/x-preview-f-free#max' "$ENTRY_TEST/opencode2.args"

PATH="$ENTRY_TEST/bin:$PATH" AGENT_FRAMEWORK=unknown \
  "$ENTRY_TEST/entrypoint.sh"  >"$ENTRY_TEST/bad.out" 2>"$ENTRY_TEST/bad.err" || true
test "$(cat "$ENTRY_TEST/lifecycle/agent.exit")" = 1
grep -Fqi 'unknown AGENT_FRAMEWORK' "$ENTRY_TEST/bad.err"

echo "agent framework: ok"
