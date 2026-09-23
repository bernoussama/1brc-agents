#!/usr/bin/env bash

# GPT-6 Sol through the Codex OAuth provider, with high reasoning.
# Requires the sandbox image's pi pin (0.87.1+), which catalogs gpt-6-sol.
# Not comparable to the v0.5 pi 0.84.2 GPT-5.6 Sol high batch.
PROVIDER=openai-codex
MODEL_ID=gpt-6-sol
THINKING=high
ADAPTER_ROUTE="pi to openai-codex OAuth to gpt-6-sol"
AUTH_MODE=file
AUTH_FILE="${HOME}/.pi/agent/auth.json"
