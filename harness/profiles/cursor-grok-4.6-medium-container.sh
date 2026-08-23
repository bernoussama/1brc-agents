#!/usr/bin/env bash

# Grok 4.6 Medium through the npx cursor-api-proxy package running inside the
# benchmark container. CURSOR_PROXY_API_KEY is only the disposable local HTTP
# bridge key; the host Cursor auth token is mounted ephemerally by run_session.
PROVIDER=cursor-api-proxy-container
MODEL_ID=cursor-grok-4.6-medium
THINKING=medium
ADAPTER_ROUTE="pi to in-container cursor-api-proxy to Cursor CLI Grok 4.6 Medium"
AUTH_MODE=env
AUTH_ENV=CURSOR_PROXY_API_KEY
CURSOR_PROXY_IN_CONTAINER=1
MODELS_FILE="${ROOT}/harness/profiles/cursor-grok-4.6-medium-container.models.json"

NCPUS=6
MEM=16g
