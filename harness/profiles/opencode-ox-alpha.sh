#!/usr/bin/env bash

# Ox Alpha Free through the standard OpenCode Zen provider.
# Supply OPENCODE_API_KEY at launch; it is never stored in this profile or
# the repository. Use the model's maximum supported reasoning effort.
PROVIDER=opencode
MODEL_ID=ox-alpha-free
THINKING=max
ADAPTER_ROUTE="pi to OpenCode Zen to ox-alpha-free"
AUTH_MODE=env
AUTH_ENV=OPENCODE_API_KEY
MODELS_FILE="${ROOT}/harness/profiles/opencode-ox-alpha.models.json"
NCPUS=6
MEM=16g
