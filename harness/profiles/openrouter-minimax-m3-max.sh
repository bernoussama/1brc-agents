#!/usr/bin/env bash

# MiniMax M3 through OpenRouter, with maximum reasoning effort.
# Note: minimax/minimax-m3:free is unavailable on OpenRouter; this profile
# uses the paid slug minimax/minimax-m3. The API key is supplied at launch
# through OPENROUTER_API_KEY and is never stored in this profile or the repo.
PROVIDER=openrouter
MODEL_ID=minimax/minimax-m3
THINKING=max
ADAPTER_ROUTE="pi to OpenRouter to minimax/minimax-m3"
AUTH_MODE=env
AUTH_ENV=OPENROUTER_API_KEY
MODELS_FILE="${ROOT}/harness/profiles/openrouter-minimax-m3.models.json"
