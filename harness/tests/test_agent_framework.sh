#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

bash -n \
  "$ROOT/harness/run_session.sh" \
  "$ROOT/harness/lib/agent_entrypoint.sh" \
  "$ROOT/harness/lib/opencode_home.sh" \
  "$ROOT/harness/profiles/opencode-cli-ox-alpha.sh" \
  "$ROOT/harness/profiles/opencode-cli-hy3-free-high.sh" \
  "$ROOT/harness/profiles/opencode-cli-muse-spark-free-xhigh.sh" \
  "$ROOT/harness/profiles/opencode-cli-gpt-5.6-sol-high.sh"

grep -Fq models.dev "$ROOT/harness/setup_network.sh"
grep -Fq OPENCODE_MODELS_FETCH "$ROOT/harness/run_session.sh"

# Native OpenCode 2 launch argv, not the v1 CLI.
grep -Fq -- '--standalone run' "$ROOT/harness/run_session.sh"
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

TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
# shellcheck disable=SC1091
source "$ROOT/harness/lib/opencode_home.sh"
seed_opencode_home "$TEST_DIR" "$ROOT/harness/lib/opencode.v2.jsonc"
test -f "$TEST_DIR/pi-home/.config/opencode/opencode.jsonc"
test "$(stat -c '%a' "$TEST_DIR/pi-home/.config/opencode/opencode.jsonc")" = 600

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

# Existing pi-to-Zen profiles must stay on pi.
unset AGENT_FRAMEWORK
# shellcheck disable=SC1091
source "$ROOT/harness/profiles/opencode-ox-alpha.sh"
[ "${AGENT_FRAMEWORK:-pi}" = pi ] || {
  echo "pi-to-Zen profile must not switch AGENT_FRAMEWORK" >&2
  exit 1
}

ENTRY_TEST="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR" "$ENTRY_TEST"' EXIT
mkdir -p "$ENTRY_TEST/bin" "$ENTRY_TEST/lifecycle"
cat > "$ENTRY_TEST/bin/opencode2" <<'EOF'
#!/bin/sh
printf 'opencode2-stub:%s\n' "$*" > /tmp/1brc-opencode2-stub.args
printf '%s\n' "$@"
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
  "$ENTRY_TEST/entrypoint.sh" --standalone run --format json --auto -m opencode/x-preview-f-free#max "goal" \
  >"$ENTRY_TEST/out" 2>"$ENTRY_TEST/err"
test "$(cat "$ENTRY_TEST/lifecycle/agent.exit")" = 0
grep -Fq -- '--standalone run' /tmp/1brc-opencode2-stub.args
grep -Fq -- '-m opencode/x-preview-f-free#max' /tmp/1brc-opencode2-stub.args

PATH="$ENTRY_TEST/bin:$PATH" AGENT_FRAMEWORK=unknown \
  "$ENTRY_TEST/entrypoint.sh"  >"$ENTRY_TEST/bad.out" 2>"$ENTRY_TEST/bad.err" || true
test "$(cat "$ENTRY_TEST/lifecycle/agent.exit")" = 1
grep -Fqi 'unknown AGENT_FRAMEWORK' "$ENTRY_TEST/bad.err"

rm -f /tmp/1brc-opencode2-stub.args
echo "agent framework: ok"
