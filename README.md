# 1BRC-Agents

A benchmark where AI coding agents compete head-to-head to write the fastest
program for a 1BRC-style task — fully autonomously, with no general network
access, on identical pinned infrastructure. Model API traffic uses a logging
allowlist proxy.

## What's here

- `bench.yml` — the frozen v0.5 run profile: image digests, resources,
  budgets, judge settings.
- `task/` — what the agent sees: `program.md` and the agent-side tools.
- `docker/` — the pinned sandbox image recipe.
- `harness/` — session runner, profiles, network setup, cleanup.
- `judge/` — reference implementations and score coordinator.
- `runs/<date>-<label>/` — published batches: results table, provenance,
  and per-configuration artifact bundles.
- `release/` — builders and verifiers for a published batch.

The full methodology is in [methodology.md](methodology.md). Roadmap and open
questions are in [ROADMAP.md](ROADMAP.md). Operational detail for running
sessions is in [harness/README.md](harness/README.md).

## Running it

```bash
docker build -t 1brc-agents-sandbox:latest -f docker/Dockerfile .
sudo ./harness/setup_network.sh
export OPENROUTER_API_KEY=...
BUDGET_MIN=120 ./harness/run_session.sh qwen harness/profiles/openrouter-qwen.sh A
```

## Honest labeling

v0.5 results are single-box, single-session, n=1 per model. Publish with that
label and full traces. That transparency is the product.

The canonical neutral-prompt v0.5 batch is
[runs/2026-08-21-neutral-v0.5](runs/2026-08-21-neutral-v0.5/).

## Credits

- 1BRC by Gunnar Morling (the task)
- Prime Intellect's "Measuring Autonomous AI Research" (harness pattern:
  program.md, offline sandbox, frozen verifier, per-run manifests)
- pi (pi.dev) — the coding-agent harness

## License

[MIT](LICENSE.txt)
