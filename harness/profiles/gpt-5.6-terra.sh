#!/usr/bin/env bash

# GPT-5.6 Terra through the Codex OAuth provider, with medium reasoning.
PROVIDER=openai-codex
MODEL_ID=gpt-5.6-terra
THINKING=medium
ADAPTER_ROUTE="pi to openai-codex OAuth to gpt-5.6-terra"
AUTH_MODE=file
AUTH_FILE="${HOME}/.pi/agent/auth.json"
