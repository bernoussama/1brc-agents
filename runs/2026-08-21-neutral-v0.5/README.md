# Neutral-prompt v0.5 results

These are **single-box, single-session, unofficial Round A results**.
Every row is `n=1`; this is a comparison of the named agent
configurations and adapter routes, not a definitive model ranking.

## Results

| Rank | Configuration | Reasoning | Median | Five timed runs (ms) | Agent time | Adapter/provider route |
|---:|---|---|---:|---|---:|---|
| 1 | [Cursor Grok 4.6 Medium](cursor-grok-4.6-medium/) | medium | 1904.5 ms | 1940.6, 1883.2, 1905.2, 1904.5, 1894.1 | 72.0 min | pi to in-container cursor-api-proxy to Cursor CLI Grok 4.6 Medium |
| 2 | [GLM 5.3](glm-5.3/) | max | 1923.5 ms | 1879.8, 1878.5, 1928.6, 1952.8, 1923.5 | 56.1 min | pi to Z.AI Coding Plan to glm-5.3 |
| 3 | [GPT-5.6 Luna](gpt-5.6-luna/) | max | 2403.7 ms | 2343.9, 2434.2, 2465.4, 2338.4, 2403.7 | 79.8 min | pi to openai-codex OAuth to gpt-5.6-luna |
| 4 | [Gemini 3.7 Flash](gemini-3.7-flash/) | high | 2989.7 ms | 4836.8, 2989.7, 2675.4, 2761.3, 3480.6 | 19.4 min | pi to CLIProxyAPI bridge to Antigravity gemini-3.7-flash-high |
| 5 | [Ox Alpha](ox-alpha/) | max | 3898.2 ms | 3686.9, 3756.0, 3914.0, 3898.2, 3974.8 | 100.0 min | pi to OpenRouter to stealth/ox-alpha |
| 6 | [GPT-5.6 Terra](gpt-5.6-terra-medium/) | medium | 4661.3 ms | 6838.0, 4797.1, 4661.3, 4425.6, 4535.0 | 9.3 min | pi to openai-codex OAuth to gpt-5.6-terra |
| 7 | [GPT-5.6 Sol](gpt-5.6-sol-high/) | high | 5186.3 ms | 4915.3, 5561.1, 5369.1, 5077.4, 5186.3 | 7.4 min | pi to openai-codex OAuth to gpt-5.6-sol |
| 8 | [GPT-5.6 Terra](gpt-5.6-terra-max/) | max | 5905.4 ms | 7700.5, 5695.6, 5819.9, 5925.9, 5905.4 | 43.1 min | pi to openai-codex OAuth to gpt-5.6-terra |

Cursor Grok 4.6 Medium and GLM 5.3 are a **near-tie**: their medians
differ by only 19.0 ms (1.0%), and their timed ranges overlap.
The data does not support declaring either configuration categorically superior.

All successful submissions produced byte-exact output on the same held-out
1B-row dataset. Scoring used the same container image, a disconnected
network, 6 CPU-equivalents, 16 GiB, one untimed warmup, and five timed runs.

## Failed first attempts

- [Gemini 3.7 Flash first attempt](gemini-3.7-flash-attempt-1/): The agent exited after two seconds without creating work/submission/run.sh; scoring failed at the missing submission boundary. The manifest records score exit status 1.
- [Ox Alpha first attempt](ox-alpha-attempt-1/): The agent exited after 17 seconds without creating work/submission/run.sh; scoring failed at the missing submission boundary. The manifest records score exit status 1.

These attempts are excluded from the result table, but retained so the
serial batch history is not rewritten as an all-success run.

## Provenance

- Release tag: `v0.5-neutral-2026-08-23`
- Exact harness commit: `385df58f240644436fe0f5e24e307a47924eb52a`
- Agent harness: `pi 0.84.2`
- Prompt SHA-256: `dc40755a1e6c067e60d5c1159336678483db9ff74cce124ed74129c5f933b34e`
- Judge SHA-256: `1f3f8aeb0181e18248a253e54d0bfb23fec7c9166350c5be28f5447064cee2c1`
- In-container judge runner SHA-256: `b4a5c51b4143f81c2e2b18f50b4f016dd54a85c73bc5690540f523613c48edcc`
- Session runner SHA-256: `a901a162424171e6669ba15bd5a81223d494abbf3daac2bd1cba9d54debf6333`
- Sandbox image: `sha256:ebc131d318fa10fdac858ec44fa61aa12c1e3d41039104759930bdf0e1f625ab`
- Proxy image: `sha256:e43291217da0015d62997806078392bccc8d196a82891b251568a597938f0bff`
- Dataset SHA-256: `59f834861945ddf9cb0bb044595b7639859d2e2f9303c748c6f6610556efb088`
- Generator source SHA-256: `efc83686387bfb2fd4b7d03c6e6248ff8828764758ae6dd32ea817a2207a093d`
- Hardware: Intel Core i7-9750H, 6 physical cores / 12 logical CPUs, Intel SSDPEMKF010T8 NVMe
- Warm-cache policy: one untimed warmup followed by five timed runs

The complete machine-readable record is [results.json](results.json).
Verify the published bundles with `python3 release/verify_release.py`.
Each bundle directory contains `SHA256SUMS` and an `omitted-files.json`
inventory. Published bundles retain the agent trace (`events.jsonl`, `pi.err`),
scoring evidence, and the final submission (`run.sh`, binary, and source).
Intermediate experiments and scratch files are omitted.

## Limits

- One agent session per configuration; no session-level variance estimate.
- Reasoning settings and provider/adapter routes differ and are reported explicitly.
- Only classic 1BRC Round A was run; the anti-retrieval Round B was not run.
- The five-pass median measures the generated program after an untimed warmup;
  it does not measure cold-cache storage performance.
- Cross-provider token and cost totals are omitted because event accounting is
  not normalized across adapters.
