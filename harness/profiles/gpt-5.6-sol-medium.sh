#!/usr/bin/env bash

# GPT-5.6 Sol through the Codex OAuth provider, with medium reasoning.
PROVIDER=openai-codex
MODEL_ID=gpt-5.6-sol
THINKING=medium
AUTH_MODE=file
AUTH_FILE="${HOME}/.pi/agent/auth.json"

# Keep the resource envelope aligned with the Luna comparison run.
