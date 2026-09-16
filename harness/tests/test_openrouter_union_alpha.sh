#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROFILE="$ROOT/harness/profiles/openrouter-union-alpha-max.sh"
MODELS="$ROOT/harness/profiles/openrouter-union-alpha.models.json"

grep -q '^PROVIDER=openrouter$' "$PROFILE"
grep -q '^MODEL_ID=stealth/union-alpha$' "$PROFILE"
grep -q '^THINKING=max$' "$PROFILE"
grep -q '^AUTH_MODE=env$' "$PROFILE"
grep -q '^AUTH_ENV=OPENROUTER_API_KEY$' "$PROFILE"

python3 - "$MODELS" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
provider = data["providers"]["openrouter"]
assert provider["api"] == "openai-completions"
assert provider["baseUrl"] == "https://openrouter.ai/api/v1"
ids = [m["id"] for m in provider["models"]]
assert ids == ["stealth/union-alpha"], ids
model = provider["models"][0]
assert model["reasoning"] is True
assert model["contextWindow"] == 262144
assert model["maxTokens"] == 131072
assert model["compat"]["supportsReasoningEffort"] is True
assert model["compat"]["thinkingFormat"] == "openrouter"
PY

echo "openrouter union-alpha profile tests: ok"
