# pi + GPT-6 Luna max session (2026-09-23)

This is **not** part of the published [neutral-prompt v0.5](../2026-08-21-neutral-v0.5/)
leaderboard, and it is **not** comparable to the GPT-6 Sol high pi 0.87.1
session (median 3901.4 ms). Same host class and the same scored-file digest
as that Sol session (`11a6e87f…`), but a different model and thinking level.
Both use a sandbox image that is not the v0.5 pin.

## Results

| Rank | Configuration | Reasoning | Median | Five timed runs (ms) | Agent time | Adapter/provider route |
|---:|---|---|---:|---|---:|---|
| 1 | [GPT-6 Luna](gpt-6-luna-max/) | max | 8034.2 ms | 9959.2, 8654.4, 7890.0, 8034.2, 7990.8 | 116.4 min | pi to openai-codex OAuth to gpt-6-luna |

The submission produced byte-exact output on the held-out 1B-row dataset.
Scoring used the agent container with the network disconnected, 4
CPU-equivalents, 16 GiB, one untimed warmup, and five timed runs. The agent
exited on its own (`stop_reason: agent_exit`, container exit 0) after 6983 s;
score exit status was 0.

## Provenance

- Batch id: `pi-gpt-6-luna-max-cloud-agent-2026-09-23`
- Exact harness commit: `32a4b4a861fe19e0aaf08c2eb89ddbce0249e7d5`
- Agent harness: `pi 0.87.1`
- Prompt SHA-256: `dc40755a1e6c067e60d5c1159336678483db9ff74cce124ed74129c5f933b34e`
- Judge SHA-256: `1f3f8aeb0181e18248a253e54d0bfb23fec7c9166350c5be28f5447064cee2c1`
- In-container judge runner SHA-256: `b4a5c51b4143f81c2e2b18f50b4f016dd54a85c73bc5690540f523613c48edcc`
- Session runner SHA-256: `d2b769876d684a5768234befdfb91a9f9d08fab3be75b6f9e4f7a68c02c5a9e0`
- Sandbox image: `sha256:fa47a4fb7c27ca4d0d56be6d34ce78b1c4d44a44966b4264085ebda48cc702be`
- Proxy image: `sha256:5ffb4be2bc56058c8c8d503b548ae009aa434db3206ee0f09ad6c39cb10f33df`
- Dataset SHA-256: `11a6e87f0336ae842a2ddad4a3a9fb3d410a1a2dab9cbd9ea03e1f347ec0c350`
  (same generator source as v0.5; byte digest differs from the v0.5 pin
  `59f83486…`. This session ran with `BENCH_ALLOW_OVERRIDE=1` and reused the
  volume from the GPT-6 Sol high session)
- Generator source SHA-256: `efc83686387bfb2fd4b7d03c6e6248ff8828764758ae6dd32ea817a2207a093d`
- Hardware: Intel Xeon (cloud-agent), 4 physical cores / 4 logical CPUs,
  4 CPU quota, 16 GiB, cloud-ephemeral storage
- Warm-cache policy: one untimed warmup followed by five timed runs

The complete machine-readable record is [results.json](results.json).
Published bundles retain the agent trace (`events.jsonl`, `pi.err`), scoring
evidence, and the final submission (`run.sh`, `solution` binary, and
`solution.cpp`). Intermediate experiment binaries are omitted.

## Limits

- One agent session; no session-level variance estimate.
- Not comparable to v0.5 (different pi version, sandbox image, and scored
  dataset digest) or to the GPT-6 Sol high row (different model and thinking
  level).
- Only classic 1BRC Round A was run; the anti-retrieval Round B was not run.
- The five-pass median measures the generated program after an untimed warmup;
  it does not measure cold-cache storage performance.
- Token and cost totals are omitted.
