#!/usr/bin/env bash

# Union Alpha through OpenRouter, maximum reasoning effort.
# OpenRouter's public listing currently omits reasoning from
# supported_parameters; this overlay still asks pi for THINKING=max so
# the request carries the highest effort the adapter can send.
# The API key is supplied at launch through OPENROUTER_API_KEY and is never
# stored in this profile or the repository.
PROVIDER=openrouter
MODEL_ID=stealth/union-alpha
THINKING=max
ADAPTER_ROUTE="pi to OpenRouter to stealth/union-alpha"
AUTH_MODE=env
AUTH_ENV=OPENROUTER_API_KEY
MODELS_FILE="${ROOT}/harness/profiles/openrouter-union-alpha.models.json"
