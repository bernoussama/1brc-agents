# 1BRC-Agents

A benchmark where AI coding agents compete head-to-head to write the fastest
program for a 1BRC-style task — fully autonomously, with no general network
access, on identical pinned infrastructure. Model API traffic uses a logging
allowlist proxy.

## What's here

- `bench.yml` — frozen run profile the session runner loads: host resource
  presets, image digests, budgets, dataset pins, judge settings.
- `task/` — what the agent sees: `program.md` and the agent-side tools.
- `docker/` — the pinned sandbox image recipe.
- `harness/` — session runner, profiles, network setup, cleanup.
- `judge/` — reference implementations and score coordinator.
- `runs/<date>-<label>/` — published batches: results table, provenance,
  and per-configuration artifact bundles.
- `release/` — builders and verifiers for a published batch.
- `site/` — Astro project site (8-BitQuest theme) with the engineering blog.
- `notes/` — draft write-ups (blog source lives in `notes/` and is published
  via `site/src/data/blog/`).

The full methodology is in [methodology.md](methodology.md). Roadmap and open
questions are in [ROADMAP.md](ROADMAP.md). Operational detail for running
sessions is in [harness/README.md](harness/README.md).

## Running it

```bash
docker build -t 1brc-agents-sandbox:latest -f docker/Dockerfile .
sudo ./harness/setup_network.sh
export OPENROUTER_API_KEY=...
./harness/run_session.sh qwen harness/profiles/openrouter-qwen.sh
```

Environment, budget, dataset, and judge settings come from
[bench.yml](bench.yml). Host presets pick the resource envelope for the
machine the bench is running on. Profiles supply only the model and credentials.

## Honest labeling

v0.5 results are single-box, single-session, n=1 per model. Publish with that
label and full traces. That transparency is the product.

The canonical neutral-prompt v0.5 batch is
[runs/2026-08-21-neutral-v0.5](runs/2026-08-21-neutral-v0.5/).

An unofficial pi 0.87.1 GPT-6 Sol high cloud-agent session is
[runs/2026-09-23-pi-gpt-6-sol-high-cloud-agent](runs/2026-09-23-pi-gpt-6-sol-high-cloud-agent/).
It uses a newer pi pin, a new sandbox digest, and a different scored-file
digest than v0.5 and the earlier pi cloud-agent notebook.

An unofficial native OpenCode 2 (`opencode2`) cloud-agent session is
[runs/2026-09-19-opencode2-cloud-agent](runs/2026-09-19-opencode2-cloud-agent/).
It is a different adapter, image, dataset digest, and host; it is not part of
the v0.5 leaderboard.

An unofficial OpenCode 2 **conductor** session (Sol high orchestrating
DeepSeek V4.1 Flash `#max` workers) is
[runs/2026-09-19-opencode-conductor-cloud-agent](runs/2026-09-19-opencode-conductor-cloud-agent/).
It is a different adapter from both v0.5 and solo Sol-high OpenCode 2.

## Credits

- 1BRC by Gunnar Morling (the task)
- Prime Intellect's "Measuring Autonomous AI Research" (harness pattern:
  program.md, offline sandbox, frozen verifier, per-run manifests)
- pi (pi.dev) — the default coding-agent harness
- OpenCode 2 (`opencode2`) — optional native-CLI track, separate from pi

## License

[MIT](LICENSE.txt)
