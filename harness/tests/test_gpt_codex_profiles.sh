#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROFILES="$ROOT/harness/profiles"

shopt -s nullglob
gpt_profiles=("$PROFILES"/gpt-*.sh "$PROFILES"/codex.sh)
test "${#gpt_profiles[@]}" -gt 0

for profile in "${gpt_profiles[@]}"; do
  grep -q '^PROVIDER=openai-codex$' "$profile" || {
    echo "GPT profile must use Codex: $profile" >&2
    exit 1
  }
  grep -q '^AUTH_MODE=file$' "$profile" || {
    echo "GPT profile must use AUTH_MODE=file: $profile" >&2
    exit 1
  }
done

openrouter_gpt=("$PROFILES"/openrouter-gpt-*.sh)
if [ "${#openrouter_gpt[@]}" -gt 0 ]; then
  echo "GPT models must not have OpenRouter profiles: ${openrouter_gpt[*]}" >&2
  exit 1
fi

python3 - "$PROFILES/openai-codex-gpt-6-astra.models.json" <<'PY'
import json, sys
path = sys.argv[1]
data = json.load(open(path))
provider = data["providers"]["openai-codex"]
assert provider["api"] == "openai-codex-responses"
assert provider["baseUrl"] == "https://chatgpt.com/backend-api"
assert "apiKey" not in provider
ids = [m["id"] for m in provider["models"]]
assert ids == ["gpt-6-astra"], ids
astra = provider["models"][0]
assert astra["thinkingLevelMap"]["medium"] == "medium"
PY

echo "gpt codex profile tests: ok"
