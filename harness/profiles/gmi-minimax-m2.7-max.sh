#!/usr/bin/env bash

# MiniMax M2.7 via GMI Serving (OpenAI-compatible). Thinking is enabled with
# pi THINKING=max through thinkingFormat=deepseek, which sends
# thinking: { type: "enabled" } — the maximum reasoning mode this endpoint
# accepts via pi's OpenAI-compatible adapter.
# Credential: host env GMI_API_KEY (never stored in this profile or the repo).
PROVIDER=gmi
MODEL_ID=MiniMaxAI/MiniMax-M2.7
THINKING=max
ADAPTER_ROUTE="pi to GMI Serving (OpenAI-compatible) to MiniMaxAI/MiniMax-M2.7"
AUTH_MODE=env
AUTH_ENV=GMI_API_KEY
MODELS_FILE="${ROOT}/harness/profiles/gmi-minimax-m3.models.json"
