# GPT-5.6 via Codex subscription (OAuth — NO api key).
# One-time on the runner host: `pi` then /login -> ChatGPT Plus/Pro (Codex).
# pi stores auto-refreshing tokens in ~/.pi/agent/auth.json; the runner
# copies them into the session pi-home. Verify provider/model ids once
# with: pi --list-models codex
PROVIDER=codex
MODEL_ID=gpt-5.6
AUTH_JSON=1
NCPUS=4
MEM=8g
