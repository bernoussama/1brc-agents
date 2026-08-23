# AGENTS.md

This repository (`1BRC-Agents`) is a benchmark **harness**, not an app. It runs
AI coding agents (via `pi`) inside a pinned Docker sandbox to write the fastest
correct 1BRC-style program, then scores each submission byte-exact and by median
runtime. Start with [`README.md`](README.md), [`methodology.md`](methodology.md),
and [`harness/README.md`](harness/README.md); config lives in [`bench.yml`](bench.yml).

## Cursor Cloud specific instructions

The dependency-refresh update script only ensures the sibling `1brc` checkout
(below). Everything else here is durable context for running things by hand.

### What already works in this VM (no Docker, no secrets)

- `python3` (+ PyYAML), `java`/`javac`, `node`, and `gcc` are preinstalled in
  the base image. There is no lint config and no repo-level package manifest
  (no `requirements.txt`/`package.json`); the judge and tools are Python stdlib.
- Automated tests are `harness/tests/*.sh` plus `node harness/tests/test_proxy.js`
  (list in `harness/README.md`). All pass here except `test_profiling.sh`, which
  requires the built Docker sandbox image. `test_scoring_container.sh` and
  `test_scored_dataset.sh` pass by design-skipping their Docker sections when the
  image/network is absent.
- The core scoring engine runs end-to-end without Docker via the documented
  smoke test in `harness/README.md`: `harness/lib/onebrc_generator.sh` to make
  data, then `python3 judge/score.py --host --round A ...`. `--host` mode is for
  smoke tests only; real benchmark scoring always uses `--container`.

### Sibling `1brc` checkout (required by the Java generator and `test_1brc.sh`)

- `harness/lib/onebrc_generator.sh` and `harness/tests/test_1brc.sh` expect the
  canonical generator at `../1brc` (i.e. `/1brc`). The update script clones
  `https://github.com/gunnarmorling/1brc.git` there if missing (best-effort).
- Point elsewhere with `ONEBRC_ROOT=/path/to/1brc` if `/1brc` is unavailable.

### What is NOT runnable here without extra setup

- A full session (`harness/run_session.sh`) needs all of: Docker (not installed),
  root network lockdown via `sudo ./harness/setup_network.sh` (needs `iptables`,
  also not installed), a model-provider API key for the chosen `harness/profiles/*`,
  and a validated ~13 GB 1B-row scored dataset volume. Treat it as blocked in this
  VM unless those are provisioned.
- Building the sandbox image (`docker build -f docker/Dockerfile .`) downloads a
  large multi-language toolchain (GraalVM, Rust, Go, Zig, pi) and is only needed
  for the Docker-dependent tests and real sessions.

### Non-obvious gotchas

- The VM hostname is `cursor`, so `harness/lib/load_bench.py` auto-selects the
  `cloud-agent` preset (4 CPU / 16 GiB). Force another with `BENCH_HOST=laptop`,
  or allow ad-hoc caps for local smoke runs with `BENCH_ALLOW_OVERRIDE=1`.
- Session scratch under `.sessions/` and generated `data/` are gitignored;
  published batches live under `runs/`.
