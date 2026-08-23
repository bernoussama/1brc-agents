# AGENTS.md

## Cursor Cloud specific instructions

This repo (**1BRC-Agents**) is a benchmark *harness*, not a web/DB app. It runs
AI coding agents inside a locked-down Docker sandbox to write the fastest 1BRC
program, then scores their submission (median of timed runs, byte-exact check).
See `README.md`, `RULESET.md`, and `harness/README.md` for the authoritative
commands; only the non-obvious environment caveats are captured here.

### No package manifests
There are no lockfiles or dependency manifests. The Python judge is stdlib-only
(`python3`) and the Node proxy/tests are stdlib-only (`node`). "Installing
dependencies" therefore means: the sibling 1BRC Java generator checkout, Docker,
and the pre-built sandbox/proxy images (all provided by the environment below).
The update script only refreshes the sibling checkout and working dirs.

### Sibling 1BRC generator checkout (required for datasets + several tests)
The harness generates data with `dev.morling.onebrc.CreateMeasurements` from a
sibling `../1brc` checkout (default `ONEBRC_ROOT` resolves to `/1brc`). This
environment clones it to `$HOME/1brc` and symlinks `/1brc -> $HOME/1brc`, so the
zero-config default works. If `/1brc` is missing, either recreate the symlink
(`sudo ln -sfn "$HOME/1brc" /1brc`) or pass `ONEBRC_ROOT=$HOME/1brc`.

### Docker (required for image build + container-based tests/sessions)
Docker CE is pre-installed, but **the daemon is not managed by systemd** (init is
`tini`). Start it once per boot if `pgrep -x dockerd` shows nothing:
```
sudo dockerd > /tmp/dockerd.log 2>&1 &
```
It is configured for Docker-in-Docker (storage driver `fuse-overlayfs`,
`iptables-legacy`); do not change these. The `ubuntu` user is in the `docker`
group — a fresh login shell can run `docker` directly; if you hit a socket
"permission denied", wrap the command with `sg docker -c '...'`.

### Pre-built images
`1brc-agents-sandbox:latest` (the pinned toolchain, ~3.4 GB) and
`1brc-allowlist-proxy` are built during setup and persist in the snapshot. If
`docker image inspect 1brc-agents-sandbox:latest` fails, rebuild (slow, ~5 min):
`docker build -t 1brc-agents-sandbox:latest sandbox/`. Never rebuild mid-benchmark.

### Network / allowlist proxy (per boot, before running sessions)
`sudo ./harness/setup_network.sh` creates the internal `1brc-agent-net`, starts
the `1brc-proxy` allowlist proxy, and installs the `DOCKER-USER` egress lock. It
is idempotent and must be re-run after each boot/`dockerd` restart because the
proxy containers and iptables rules do not persist.

### Lint / test / build / run
- Lint: no linter is configured; the tests act as static checks via `bash -n`,
  `python3 -m py_compile`, and `node -c`.
- Test: run the harness suite in `harness/tests/` (see `harness/README.md`).
  Docker-dependent tests (`test_profiling.sh`, `test_scored_dataset.sh`,
  `test_scoring_container.sh`) need the sandbox image and network above; the
  rest are host-only.
- Build: `docker build` of `sandbox/` and `harness/proxy/` (see above).
- Run (no model needed): host scorer smoke test —
  `judge/score.py --host` over a small generated file (README Quick start step 3).
- Run (full session): `./harness/run_session.sh <slug> <profile> <A|B>` needs a
  **model-provider API key** exported per the chosen `harness/profiles/*.sh`
  (e.g. `OPENROUTER_API_KEY`). Not set in this environment by default.

### Hardware caveat
This VM is ~4 CPU / 15 GiB, below the RULESET's recommended 6c/16 GiB box. It is
fine for smoke tests, but do **not** run a real 1B-row scored benchmark here —
use small row counts (e.g. 100k) when exercising the pipeline.
