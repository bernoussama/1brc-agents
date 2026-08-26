# OpenCode Zen free models → pi

Notes from probing OpenCode CLI v1.18.23 and `https://opencode.ai/zen/v1`
on 2026-08-25.

## How OpenCode exposes “free” models

1. Install the CLI (`opencode` binary from GitHub releases / npm `opencode-ai`).
2. `opencode models opencode --verbose` lists Zen models. Zero-cost entries
   currently include:
   - `x-preview-f-free` — **Ox Alpha Free (Unlimited)** (replaces `ox-alpha-free`)
   - `hy3-free`, `big-pickle`, `mimo-v2.5-free`
   - `nemotron-3-ultra-free`, `nemotron-3.5-lightning-free`
   - `muse-spark-1.2-contributor-free` (Chat Completions 500s; use Responses API)
3. Every free model’s API URL is the OpenAI-compatible Zen gateway:
   `https://opencode.ai/zen/v1` (same host the paid Zen catalog uses).
4. OpenCode’s own TUI/CLI still prefers `/connect` → OpenCode Zen → paste an
   `OPENCODE_API_KEY` from https://opencode.ai/auth for the built-in provider.
   That key is for the gateway identity/billing path. Free model *pricing* is
   `$0`, but the gateway still rate-limits (`FreeUsageLimitError` / HTTP 429).

## Auth behavior that matters for pi

Probed `POST /zen/v1/chat/completions` with free model ids:

| Authorization header        | Result                                      |
|----------------------------|---------------------------------------------|
| omitted                    | **200**, `"cost":"0"`                       |
| `Authorization:` (empty)   | **200**                                     |
| `Authorization: Bearer `   | **200** (empty token)                       |
| `Authorization: Bearer …` non-empty invalid | **401 AuthError**              |

So for keyless free use, pi must not send a non-empty bearer. A dummy key
like `"opencode"` / `"ollama"` **fails** on Zen free.

pi’s OpenAI SDK client also rejects a truly empty `apiKey`. The workable
trick (verified against the sandbox `openai` package) is:

```json
"apiKey": " "
```

A single space makes the client send `Authorization: Bearer` with an empty
token, which Zen free accepts.

`ox-alpha-free` is **gone** (`Model … is not supported`). Use `x-preview-f-free`.

Cloudflare sometimes 403s bare Python-urllib user-agents; a normal browser UA
or curl is fine. The 1brc allowlist already includes `opencode.ai`.

## Using them through pi in this harness

Profiles:

- `harness/profiles/opencode-ox-alpha.sh` → `x-preview-f-free`, `THINKING=max`
- `harness/profiles/opencode-hy3-free-high.sh` → `hy3-free`, `THINKING=high`
- `harness/profiles/opencode-muse-spark-free-xhigh.sh` →
  `muse-spark-1.2-contributor-free`, `THINKING=xhigh` (Responses API)
- Shared catalog: `harness/profiles/opencode-zen-free.models.json`
  (provider id `opencode-zen-free`, `apiKey: " "`, `AUTH_MODE=none`)

### Muse Spark free specifics

`POST /zen/v1/chat/completions` for `muse-spark-1.2-contributor-free` returns
HTTP 500 consistently. `POST /zen/v1/responses` works with `cost: 0`.

Maximum reasoning is `reasoning.effort: "xhigh"` (not `"max"`, which 400s).
In the shared catalog the Muse entry sets `"api": "openai-responses"` and
maps `max` → `xhigh` so pi’s `--thinking xhigh` (or `max`) is valid.

`AUTH_MODE=none` (in `harness/lib/auth.sh`) skips injecting host secrets.

Example:

```bash
export ONEBRC_ROOT=/home/ubuntu/src/1brc
export BENCH_ALLOW_OVERRIDE=1
./harness/run_session.sh ox-alpha-zen-free harness/profiles/opencode-ox-alpha.sh
```

Optional: if you have a real Zen key, you can instead use pi’s built-in
`opencode` provider with `OPENCODE_API_KEY` (paid + free models). Do **not**
point a fake key at the keyless free profile.

## CLI vs pi built-in catalog drift

`opencode models` (live) and pi’s bundled `opencode.json` can disagree on
which free ids exist. Prefer the live Zen `/v1/models` list + CLI verbose
output when refreshing `opencode-zen-free.models.json`.
