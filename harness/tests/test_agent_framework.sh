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
assert opts["workerModel"] == "openrouter/@preset/ds-v4-1-flash"
assert opts["workerFallbackModel"] == "openrouter/@preset/ds-v4-1-flash"
assert ":floor" not in opts["workerModel"]
assert ":floor" not in opts["workerFallbackModel"]
assert "#" not in opts["workerModel"]
assert opts["enableQuestion"] is False
assert opts["installAgents"] is False
models = cfg["providers"]["openrouter"]["models"]
assert "@preset/ds-v4-1-flash" in models
actions = {row["action"] for row in cfg["permissions"]}
assert "subagent" in actions
assert "question" in actions
assert "1brc_remaining_time" in actions
assert "1brc_resources" in actions
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
grep -Fq 'openrouter/@preset/ds-v4-1-flash' "$CONDUCTOR_SEED/work/.opencode/agents/conductor/coder.md"
grep -Fq 'openrouter/@preset/ds-v4-1-flash' "$CONDUCTOR_SEED/work/.opencode/agents/conductor/explore.md"
grep -Fq 'openrouter/@preset/ds-v4-1-flash' "$CONDUCTOR_SEED/work/.opencode/agents/conductor/shell-runner.md"
grep -Fq 'You are a conductor' "$CONDUCTOR_SEED/work/.opencode/agents/conductor.md"
grep -Fq '1brc_remaining_time' "$CONDUCTOR_SEED/work/.opencode/agents/conductor.md"
grep -Fq '1brc_resources' "$CONDUCTOR_SEED/work/.opencode/agents/conductor.md"
grep -Fq 'You DO call' "$CONDUCTOR_SEED/work/.opencode/agents/conductor.md"
! grep -Eq 'action:[[:space:]]+shell' "$CONDUCTOR_SEED/work/.opencode/agents/conductor.md"
! grep -Fq 'muse-spark' "$CONDUCTOR_SEED/work/.opencode/agents/conductor/coder.md"
! grep -Fq 'Fan out independent work in parallel' "$CONDUCTOR_SEED/work/.opencode/agents/conductor.md"
grep -Fq 'muse-spark-1.3-contributor-free' \
  "$ROOT/harness/lib/opencode-conductor/agents/conductor/coder.md"
grep -Fq 'Fan out independent work in parallel' \
  "$ROOT/harness/lib/opencode-conductor/agents/conductor.md"
! test -d "$CONDUCTOR_SEED/pi-home/.config/opencode/plugins/opencode-conductor/node_modules"
! test -d "$CONDUCTOR_SEED/pi-home/.config/opencode/plugins/opencode-conductor/.opencode/agents"
grep -Fq 'from "@opencode/plugin"' \
  "$CONDUCTOR_SEED/pi-home/.config/opencode/plugins/opencode-conductor/src/index.ts"
grep -Fq 'sourceVariants = entry?.variants' \
  "$ROOT/harness/lib/opencode-conductor/src/index.ts"
grep -Fq 'conductorKeepTools' "$ROOT/harness/lib/opencode-conductor/src/index.ts"
grep -Fq 'HARNESS_TOOL_SPECS' "$ROOT/harness/lib/opencode-conductor/src/index.ts"
grep -Fq 'editor.add' "$ROOT/harness/lib/opencode-conductor/src/index.ts"
grep -Fq '1brc_remaining_time' "$ROOT/harness/lib/opencode-conductor/src/harness-tools.ts"
! grep -Fq '1brc_bounded' "$ROOT/harness/lib/opencode-conductor/src/harness-tools.ts"
grep -Fq 'export function normalizeVariants' \
  "$ROOT/harness/lib/opencode-conductor/src/contract.ts"
! grep -Fq 'void variantId' "$ROOT/harness/lib/opencode-conductor/src/index.ts"

python3 - "$ROOT/harness/lib/opencode.conductor.jsonc" \
  "$ROOT/harness/lib/opencode-conductor" <<'PY'
import hashlib
import json
import re
import sys
from pathlib import Path

cfg = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
preset = cfg["providers"]["openrouter"]["models"]["@preset/ds-v4-1-flash"]
assert isinstance(preset, dict)


def normalize_variants(source):
    if source is None:
        return []
    if isinstance(source, list):
        out = []
        for item in source:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict) and isinstance(item.get("id"), str):
                out.append(item)
        return out
    if not isinstance(source, dict):
        return []
    out = []
    for vid, value in source.items():
        if isinstance(value, dict) and isinstance(value.get("id"), str):
            out.append(value)
        else:
            out.append({"id": vid})
    return out


def source_has_variant(source, vid):
    for item in normalize_variants(source):
        ident = item if isinstance(item, str) else item["id"]
        if ident == vid:
            return True
    return False


preferred = cfg["plugins"][0]["options"]["workerModel"]
fallback = cfg["plugins"][0]["options"]["workerFallbackModel"]
assert preferred == "openrouter/@preset/ds-v4-1-flash"
assert fallback == preferred
assert "#" not in preferred


def select_worker_model(source, pref, fall):
    variant = pref.split("#", 1)[1] if "#" in pref else None
    if not variant:
        return pref
    return pref if source_has_variant(source, variant) else fall


assert select_worker_model({}, preferred, fallback) == preferred
assert select_worker_model(None, preferred, fallback) == preferred
# Variant fallback still applies when a #variant is requested and missing.
max_pref = "openrouter/deepseek/deepseek-v4.1-flash#max"
max_fall = "openrouter/deepseek/deepseek-v4.1-flash#high"
assert select_worker_model({"max": {}}, max_pref, max_fall) == max_pref
assert select_worker_model({}, max_pref, max_fall) == max_fall

plugin = Path(sys.argv[2])
pin = (plugin / "PINNED_REVISION").read_text(encoding="utf-8").strip()
assert re.fullmatch(r"[0-9a-f]{40}", pin), pin
tree_file = plugin / "PINNED_TREE"
assert tree_file.is_file(), "missing PINNED_TREE"
digest = hashlib.sha256()
skip = {"PINNED_TREE"}
for path in sorted(p for p in plugin.rglob("*") if p.is_file() and p.name not in skip):
    digest.update(path.relative_to(plugin).as_posix().encode())
    digest.update(b"\0")
    digest.update(path.read_bytes())
actual = digest.hexdigest()
expected = tree_file.read_text(encoding="utf-8").strip()
assert actual == expected, f"vendored plugin tree drifted from PINNED_TREE\n{actual}\n{expected}"
PY

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
