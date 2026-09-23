#!/usr/bin/env bash

# GPT-6 Luna through the Codex OAuth provider, with max reasoning.
# Requires the sandbox image's pi pin (0.87.1+), which catalogs gpt-6-luna.
# Not comparable to the v0.5 pi 0.84.2 batch or to the GPT-6 Sol high session.
PROVIDER=openai-codex
MODEL_ID=gpt-6-luna
THINKING=max
ADAPTER_ROUTE="pi to openai-codex OAuth to gpt-6-luna"
AUTH_MODE=file
AUTH_FILE="${HOME}/.pi/agent/auth.json"
