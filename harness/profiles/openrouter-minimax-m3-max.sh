#!/usr/bin/env bash

# MiniMax M3 free tier through OpenRouter, with maximum reasoning effort.
# Uses the :free slug only — do not fall back to the paid model.
# The API key is supplied at launch through OPENROUTER_API_KEY and is never
# stored in this profile or the repository.
#
# As of 2026-08-25 OpenRouter returns 404 for this slug:
#   "This model is unavailable for free. The paid version is available now -
#    use this slug instead: minimax/minimax-m3"
# Do not switch MODEL_ID to the paid slug without an explicit request.
PROVIDER=openrouter
MODEL_ID=minimax/minimax-m3:free
THINKING=max
ADAPTER_ROUTE="pi to OpenRouter to minimax/minimax-m3:free"
AUTH_MODE=env
AUTH_ENV=OPENROUTER_API_KEY
MODELS_FILE="${ROOT}/harness/profiles/openrouter-minimax-m3.models.json"
