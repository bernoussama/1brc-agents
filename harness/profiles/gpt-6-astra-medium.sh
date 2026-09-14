#!/usr/bin/env bash

# GPT-6 Astra through Codex OAuth (ChatGPT Plus/Pro), medium reasoning.
# Pinned pi 0.84.2 does not ship gpt-6-astra in openai-codex.json, so this
# profile overlays the Codex catalog via MODELS_FILE.
PROVIDER=openai-codex
MODEL_ID=gpt-6-astra
THINKING=medium
ADAPTER_ROUTE="pi to openai-codex OAuth to gpt-6-astra"
AUTH_MODE=file
AUTH_FILE="${HOME}/.pi/agent/auth.json"
MODELS_FILE="${ROOT}/harness/profiles/openai-codex-gpt-6-astra.models.json"
