#!/usr/bin/env bash

# DeepSeek V4.1 Flash through OpenRouter, pinned to the DeepSeek provider,
# with maximum reasoning effort. The API key is supplied at launch through
# OPENROUTER_API_KEY and is never stored in this profile or the repository.
PROVIDER=openrouter
MODEL_ID=deepseek/deepseek-v4.1-flash:deepseek
THINKING=max
ADAPTER_ROUTE="pi to OpenRouter to deepseek/deepseek-v4.1-flash:deepseek"
AUTH_MODE=env
AUTH_ENV=OPENROUTER_API_KEY
MODELS_FILE="${ROOT}/harness/profiles/openrouter-deepseek-v4.1-flash.models.json"
