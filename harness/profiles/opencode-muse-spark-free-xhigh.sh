#!/usr/bin/env bash

# Muse Spark 1.2 Contributor Free through OpenCode Zen — keyless free tier.
# Chat Completions returns HTTP 500 for this model; pi must use the Responses
# API (model-level api=openai-responses in the shared catalog). Maximum
# reasoning effort is xhigh (effort "max" is rejected by Zen). AUTH_MODE=none
# + models.json apiKey " " keep Authorization: Bearer empty.
PROVIDER=opencode-zen-free
MODEL_ID=muse-spark-1.2-contributor-free
THINKING=xhigh
ADAPTER_ROUTE="pi to OpenCode Zen free Responses to muse-spark-1.2-contributor-free"
AUTH_MODE=none
MODELS_FILE="${ROOT}/harness/profiles/opencode-zen-free.models.json"
