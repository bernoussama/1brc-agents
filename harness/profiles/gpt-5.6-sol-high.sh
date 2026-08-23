#!/usr/bin/env bash

# GPT-5.6 Sol through the Codex OAuth provider, with high reasoning.
PROVIDER=openai-codex
MODEL_ID=gpt-5.6-sol
THINKING=high
ADAPTER_ROUTE="pi to openai-codex OAuth to gpt-5.6-sol"
AUTH_MODE=file
AUTH_FILE="${HOME}/.pi/agent/auth.json"

# Keep the resource envelope aligned with the other GPT-5.6 comparison runs.
