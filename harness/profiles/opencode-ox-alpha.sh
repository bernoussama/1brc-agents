#!/usr/bin/env bash

# Ox Alpha Free (Unlimited) through OpenCode Zen — keyless free tier.
# Model id is x-preview-f-free (ox-alpha-free is no longer served).
# Zen free accepts Authorization: Bearer with an empty token. models.json
# uses apiKey " " (single space) so pi's OpenAI client sends that form; a
# non-empty fake key returns AuthError. AUTH_MODE=none keeps the container
# credential-free. Use max reasoning effort.
PROVIDER=opencode-zen-free
MODEL_ID=x-preview-f-free
THINKING=max
ADAPTER_ROUTE="pi to OpenCode Zen free to x-preview-f-free"
AUTH_MODE=none
MODELS_FILE="${ROOT}/harness/profiles/opencode-zen-free.models.json"
