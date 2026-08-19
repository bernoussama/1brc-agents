# GPT-5.6 via Codex subscription (OAuth — NO api key).
# One-time on the runner host: `pi` then /login -> ChatGPT Plus/Pro (Codex).
# pi stores auto-refreshing tokens in ~/.pi/agent/auth.json; the runner
# copies that file into the session pi-home. This provider/model pair is from
# the pinned @earendil-works/pi-coding-agent image.
PROVIDER=openai-codex
MODEL_ID=gpt-5.6-sol
AUTH_MODE=file
AUTH_FILE="${HOME}/.pi/agent/auth.json"
NCPUS=4
MEM=8g
