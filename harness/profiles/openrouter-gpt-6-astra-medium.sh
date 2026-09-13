#!/usr/bin/env bash

# GPT-6 Astra through OpenRouter, with medium reasoning effort. The API
# key is supplied at launch through OPENROUTER_API_KEY and is never stored
# in this profile or the repository.
PROVIDER=openrouter
MODEL_ID=openai/gpt-6-astra
THINKING=medium
ADAPTER_ROUTE="pi to OpenRouter to openai/gpt-6-astra"
AUTH_MODE=env
AUTH_ENV=OPENROUTER_API_KEY
MODELS_FILE="${ROOT}/harness/profiles/openrouter-gpt-6-astra.models.json"
