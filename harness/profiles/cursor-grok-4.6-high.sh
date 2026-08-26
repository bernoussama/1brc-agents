#!/usr/bin/env bash

# Grok 4.6 High through the host's `npx cursor-api-proxy` service.
# CURSOR_PROXY_API_KEY is only the local bridge key; the proxy itself uses the
# host Cursor CLI authentication and is never given to the agent container.
PROVIDER=cursor-api-proxy
MODEL_ID=cursor-grok-4.6-high
THINKING=high
ADAPTER_ROUTE="pi to host cursor-api-proxy to Cursor CLI Grok 4.6 High"
AUTH_MODE=env
AUTH_ENV=CURSOR_PROXY_API_KEY
MODELS_FILE="${ROOT}/harness/profiles/cursor-grok-4.6-high.models.json"
