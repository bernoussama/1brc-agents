# Cloud-agent Union Alpha traces

These are **single-box, single-session, unofficial Round A results**
from a Cursor cloud-agent VM (Xeon, 4 CPU / 16 GiB, 120-minute budgets).
Every row is `n=1`. They are **not comparable** to the laptop
[neutral-prompt v0.5](../2026-08-21-neutral-v0.5/) batch.

This batch is the Union Alpha session from this host. Other cloud-agent
chart rows are not published here. GPT-6 Astra and DeepSeek V4.1 Flash
traces live in a separate 2026-09-13 cloud-agent batch when that tree is
present.

## Canonical rows

| Rank | Configuration | Reasoning | Median | Five timed runs (ms) | Agent time | Adapter/provider route |
|---:|---|---|---:|---|---:|---|
| 1 | [Union Alpha](union-alpha-max/) | max | 4421.1 ms | 5108.5, 4550.4, 4421.1, 4212.6, 4213.8 | 112.0 min | pi to OpenRouter to stealth/union-alpha |

The canonical submission produced byte-exact output on the held-out
1B-row dataset. Scoring used the same container image, a disconnected
network, 4 CPU-equivalents, 16 GiB, one untimed warmup, and five timed runs.

## Provenance

- Published on: `2026-09-17`
- Agent harness: `pi 0.84.2`
- Prompt SHA-256: `dc40755a1e6c067e60d5c1159336678483db9ff74cce124ed74129c5f933b34e`
- Judge SHA-256: `1f3f8aeb0181e18248a253e54d0bfb23fec7c9166350c5be28f5447064cee2c1`
- In-container judge runner SHA-256: `b4a5c51b4143f81c2e2b18f50b4f016dd54a85c73bc5690540f523613c48edcc`
- Session runner SHA-256: `cbfd65626fa427793d84e4d0c6defbeb652eb5b6a4ad22ceb05368da3d2044ea`
- Sandbox image: `sha256:ee74d3779db486610615d2d6ca4cd9ad52c1d1034711a7549d7328b03e3067a7`
- Proxy image: `sha256:7fc104f7cea24214cdcd3c6ecc6d31d9d7719213a3201878a2f39bce7b462334`
- Dataset SHA-256: `daa7a62a8daa0fe452b33407fc419113a81700221008510e4270211b02706710`
- Generator source SHA-256: `efc83686387bfb2fd4b7d03c6e6248ff8828764758ae6dd32ea817a2207a093d`
- Hardware: Intel(R) Xeon(R) Processor, 4 physical cores / 4 logical CPUs, cloud-ephemeral
- Warm-cache policy: one untimed warmup followed by five timed runs

The complete machine-readable record is [results.json](results.json).
Verify the published bundles with `python3 release/verify_cloud_agent_release.py`.
Each bundle directory contains `SHA256SUMS` and an `omitted-files.json`
inventory. Published bundles retain the agent trace (`events.jsonl`, `pi.err`),
scoring evidence, and the final submission (`run.sh`, binary, and source).
Intermediate experiments and scratch files are omitted.

## Limits

- One agent session per configuration; no session-level variance estimate.
- Not the full cloud-agent chart; only Union Alpha traces from this VM.
- Only classic 1BRC Round A was run; Round B was not run.
- Cloud-agent medians are not comparable to laptop v0.5 medians.
- Dataset and sandbox image hashes differ from the 2026-09-13 Astra/DeepSeek
  cohort, so these rows are a separate published batch.
