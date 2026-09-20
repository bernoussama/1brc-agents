#!/usr/bin/env bash

# GPT-5.6 Sol high as the OpenCode 2 conductor (ChatGPT/Codex OAuth), with
# GPT-5.6 Luna max workers on the same Codex subscription. Separate adapter
# from harness/profiles/opencode-cli-gpt-5.6-sol-high-conductor.sh (OpenRouter
# preset workers) and from solo Sol (no plugin).
#
# Requires:
#   - host OpenCode Codex login in OPENCODE_AUTH_DB / opencode.db
#   - models.dev reachable (OPENCODE_MODELS_FETCH=1)
AGENT_FRAMEWORK=opencode
PROVIDER=openai
MODEL_ID=gpt-5.6-sol
THINKING=high
OPENCODE_AGENT=conductor
OPENCODE_CONFIG="${ROOT}/harness/lib/opencode.conductor.luna.jsonc"
OPENCODE_PLUGIN_DIR="${ROOT}/harness/lib/opencode-conductor"
OPENCODE_AGENT_FILES="${ROOT}/harness/lib/opencode.conductor.luna.agents"
ADAPTER_ROUTE="opencode2 conductor openai/gpt-5.6-sol#high via ChatGPT Codex OAuth; workers openai/gpt-5.6-luna#max via Codex"
AUTH_MODE=file
AUTH_FILE="${OPENCODE_AUTH_DB:-$HOME/.local/share/opencode/opencode.db}"
OPENCODE_MODELS_FETCH=1
