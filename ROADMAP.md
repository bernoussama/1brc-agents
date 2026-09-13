# Roadmap

## v0.5 (published)

One PC + Docker, one session per model:

- Rows: 10M dev / 1B scored
- Harness runs outside the sandbox. The agent uses an internal Docker network
  whose only intended route is the logging allowlist proxy; the proxy is also
  attached to Docker's default bridge for model API egress.
- Caps: 1–2h, n=1 per model, labeled "single-box, single-session, unofficial"
- Published under [runs/2026-08-21-neutral-v0.5](runs/2026-08-21-neutral-v0.5/)

## v1 (sponsored, after v0.5 is public)

One dedicated box, 4–6 frontier models, 3 sessions each, 4h caps. Publish
results and traces. Ask Gunnar Morling for a blessing or boost.

## v2 (sponsored)

After v1 is public: labs for eval tokens (Anthropic and OpenAI both run
internal versions of this eval class per their system cards), a compute
sponsor for a beefier box or a GPU round (e.g. a GPU aggregation task as
round C), a native-CLI track per model, and community submissions.

## Open questions

- Exact box spec (NVMe read speed vs RAM-only: 13GB fits in RAM — page-cache
  resident or cold? Pick one, publish it).
- Include `perf`/`flamegraph` tooling on the image or make agents roll their
  own?
- Round B variant: median+stdev vs frequency histogram — pick whichever has
  least prior art lying around.
- Should timing include first-touch page faults (cold cache) to punish
  mmap-lazy solutions? v1: warm cache, simple. Document it.
- Model list for v1 (4–6: Claude Opus 5, GPT-5.6, Gemini, Kimi K3, DeepSeek,
  GLM — whoever has API access).
