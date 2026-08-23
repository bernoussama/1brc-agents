#!/usr/bin/env bash

# GPT-5.6 Luna through the Codex OAuth provider.
PROVIDER=openai-codex
MODEL_ID=gpt-5.6-luna
THINKING=max
ADAPTER_ROUTE="pi to openai-codex OAuth to gpt-5.6-luna"
AUTH_MODE=file
AUTH_FILE="${HOME}/.pi/agent/auth.json"

# Keep the resource envelope aligned with the current 1BRC comparison runs.
