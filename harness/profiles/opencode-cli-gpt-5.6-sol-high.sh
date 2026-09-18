#!/usr/bin/env bash

# GPT-5.6 Sol high through native OpenCode 2 with ChatGPT/Codex subscription
# OAuth (chatgpt-headless device login). Separate adapter from
# harness/profiles/gpt-5.6-sol-high.sh (pi to openai-codex).
#
# One-time on the runner host:
#   opencode2 auth login --standalone openai --method chatgpt-headless
# Tokens land in ~/.local/share/opencode/opencode.db and are copied into
# the session HOME. models.dev must be reachable (see setup_network.sh).
AGENT_FRAMEWORK=opencode
PROVIDER=openai
MODEL_ID=gpt-5.6-sol
THINKING=high
ADAPTER_ROUTE="opencode2 to ChatGPT Codex OAuth to gpt-5.6-sol"
AUTH_MODE=file
AUTH_FILE="${OPENCODE_AUTH_DB:-$HOME/.local/share/opencode/opencode.db}"
OPENCODE_MODELS_FETCH=1
