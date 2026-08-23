#!/usr/bin/env bash

# Ox Alpha through OpenRouter. The API key is supplied at launch through
# OPENROUTER_API_KEY and is never stored in this profile or the repository.
PROVIDER=openrouter
MODEL_ID=stealth/ox-alpha
THINKING=max
ADAPTER_ROUTE="pi to OpenRouter to stealth/ox-alpha"
AUTH_MODE=env
AUTH_ENV=OPENROUTER_API_KEY
MODELS_FILE="${ROOT}/harness/profiles/openrouter-ox-alpha.models.json"
NCPUS=6
MEM=16g
