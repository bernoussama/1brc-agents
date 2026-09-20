#!/usr/bin/env bash

# GPT-5.6 Sol high as the OpenCode 2 conductor (ChatGPT/Codex OAuth), with
# OpenRouter workers via the account preset `@preset/ds-v4-1-flash`.
# Separate adapter from harness/profiles/opencode-cli-gpt-5.6-sol-high.sh
# (solo Sol, no plugin).
#
# Requires:
#   - host OpenCode Codex login in OPENCODE_AUTH_DB / opencode.db
#   - OPENROUTER_API_KEY for worker calls
#   - models.dev reachable (OPENCODE_MODELS_FETCH=1)
AGENT_FRAMEWORK=opencode
PROVIDER=openai
MODEL_ID=gpt-5.6-sol
THINKING=high
OPENCODE_AGENT=conductor
OPENCODE_CONFIG="${ROOT}/harness/lib/opencode.conductor.jsonc"
OPENCODE_PLUGIN_DIR="${ROOT}/harness/lib/opencode-conductor"
OPENCODE_AGENT_FILES="${ROOT}/harness/lib/opencode.conductor.agents"
ADAPTER_ROUTE="opencode2 conductor openai/gpt-5.6-sol#high via ChatGPT Codex OAuth; workers openrouter/@preset/ds-v4-1-flash"
AUTH_MODE=file
AUTH_FILE="${OPENCODE_AUTH_DB:-$HOME/.local/share/opencode/opencode.db}"
AUTH_EXTRA_ENVS=OPENROUTER_API_KEY
OPENCODE_MODELS_FETCH=1
