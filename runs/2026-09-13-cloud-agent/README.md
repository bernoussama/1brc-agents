# Cloud-agent GPT-6 Astra and DeepSeek V4.1 Flash traces

These are **single-box, single-session, unofficial Round A results**
from a Cursor cloud-agent VM (Xeon, 4 CPU / 16 GiB, 120-minute budgets).
Every row is `n=1`. They are **not comparable** to the laptop
[neutral-prompt v0.5](../2026-08-21-neutral-v0.5/) batch.

This batch is only the sessions that still exist on the host that ran
them. Other cloud-agent chart rows (Sol, Luna, Grok, MiniMax, ox-alpha,
Muse Spark) are not published here.

## Canonical rows (also on the site charts)

| Rank | Configuration | Reasoning | Median | Five timed runs (ms) | Agent time | Adapter/provider route |
|---:|---|---|---:|---|---:|---|
| 1 | [GPT-6 Astra](gpt-6-astra-high/) | high | 1906.0 ms | 1997.0, 1913.9, 1889.2, 1906.0, 1849.5 | 117.7 min | pi to openai-codex OAuth to gpt-6-astra |
| 2 | [GPT-6 Astra](gpt-6-astra-medium/) | medium | 5675.8 ms | 5008.5, 5245.4, 5784.4, 6168.5, 5675.8 | 115.9 min | pi to openai-codex OAuth to gpt-6-astra |
| 3 | [DeepSeek V4.1 Flash :floor](deepseek-v4.1-flash-floor-max/) | max | 6736.3 ms | 5629.4, 6353.3, 6737.7, 6736.3, 6969.6 | 57.5 min | pi to OpenRouter to deepseek/deepseek-v4.1-flash:floor |

All canonical submissions produced byte-exact output on the same held-out
1B-row dataset. Scoring used the same container image, a disconnected
network, 4 CPU-equivalents, 16 GiB, one untimed warmup, and five timed runs.

## Failed first attempts

- [GPT-6 Astra medium OpenRouter first attempt](gpt-6-astra-medium-openrouter-attempt-1/): The agent exited after 41 seconds without creating work/submission/run.sh; scoring failed at the missing submission boundary. Route was OpenRouter openai/gpt-6-astra, later discarded in favor of Codex OAuth. The manifest records score exit status 1.

## Other scored attempts (not charted)

- [GPT-6 Astra medium OpenRouter](gpt-6-astra-medium-openrouter/): correct, median 8953.7 ms, 6.7 min. Correct Round A score on OpenRouter. Not the charted medium row; Codex OAuth is the published GPT-6 Astra route.
- [DeepSeek V4.1 Flash :deepseek](deepseek-v4.1-flash-deepseek/): correct, median 14816.2 ms, 2.2 min. Correct Round A score after 135 seconds. Early exit; not the charted DeepSeek row. The published profile uses :floor routing.

## Provenance

- Published on: `2026-09-14`
- Agent harness: `pi 0.84.2`
- Prompt SHA-256: `dc40755a1e6c067e60d5c1159336678483db9ff74cce124ed74129c5f933b34e`
- Judge SHA-256: `1f3f8aeb0181e18248a253e54d0bfb23fec7c9166350c5be28f5447064cee2c1`
- In-container judge runner SHA-256: `b4a5c51b4143f81c2e2b18f50b4f016dd54a85c73bc5690540f523613c48edcc`
- Session runner SHA-256: `cbfd65626fa427793d84e4d0c6defbeb652eb5b6a4ad22ceb05368da3d2044ea`
- Sandbox image: `sha256:d62f71d3f0b917b0b594b187a3c458e541d31c6e088b0e9d29463cf1836f0a64`
- Proxy image: `sha256:05503609b4d7843a6d60d8eadd8c3477b7d4fc91e6f57132b0e6c538ed90bcab`
- Dataset SHA-256: `d96e01753738bb22052665517f6d2af7b17eb120c1d99dc3e3963e1cc5fad54c`
- Generator source SHA-256: `efc83686387bfb2fd4b7d03c6e6248ff8828764758ae6dd32ea817a2207a093d`
- Hardware: Intel(R) Xeon(R) Processor, 4 physical cores / 4 logical CPUs, cloud-ephemeral
- Warm-cache policy: one untimed warmup followed by five timed runs

Harness git commits differ per session (profile overlays landed while
runs were in flight). Each bundle `manifest.yaml` records the commit
that launched that session.

The complete machine-readable record is [results.json](results.json).
Verify the published bundles with `python3 release/verify_cloud_agent_release.py`.
Each bundle directory contains `SHA256SUMS` and an `omitted-files.json`
inventory. Published bundles retain the agent trace (`events.jsonl`, `pi.err`),
scoring evidence, and the final submission (`run.sh`, binary, and source).
Intermediate experiments and scratch files are omitted.

## Limits

- One agent session per configuration; no session-level variance estimate.
- Not the full cloud-agent chart; only Astra and DeepSeek traces from this VM.
- Only classic 1BRC Round A was run; Round B was not run.
- Cloud-agent medians are not comparable to laptop v0.5 medians.
