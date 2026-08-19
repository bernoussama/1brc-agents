#!/usr/bin/env bash

# GLM 5.3 through the Z.AI Coding Plan provider.
PROVIDER=zai
MODEL_ID=glm-5.3
AUTH_MODE=env
AUTH_ENV=ZAI_API_KEY
# The benchmark host has 6 physical cores / 12 logical CPUs. Use six
# CPU-equivalents so the agent's measured worker count matches the host's
# physical-core capacity while resources.py still exposes the cgroup quota.
NCPUS=6
MEM=16g
