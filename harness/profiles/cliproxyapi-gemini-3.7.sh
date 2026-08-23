#!/usr/bin/env bash

# Gemini 3.7 Flash through the host CLIProxyAPI service. The service maps the
# client alias to Antigravity's gemini-3.7-flash-high model.
PROVIDER=cliproxyapi
MODEL_ID=gemini-3.7-flash
THINKING=high
ADAPTER_ROUTE="pi to CLIProxyAPI bridge to Antigravity gemini-3.7-flash-high"
AUTH_MODE=env
AUTH_ENV=CLIPROXY_API_KEY
MODELS_FILE="${ROOT}/harness/profiles/cliproxyapi-gemini-3.7.models.json"

NCPUS=6
MEM=16g
