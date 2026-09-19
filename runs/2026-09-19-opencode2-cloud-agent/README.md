# OpenCode 2 cloud-agent session (2026-09-19)

This is **not** part of the published [neutral-prompt v0.5](../2026-08-21-neutral-v0.5/)
leaderboard. It is a single unofficial Round A session of native OpenCode 2
(`opencode2`) on Cursor cloud-agent hardware, using ChatGPT/Codex OAuth.

Do not compare these medians to v0.5. The adapter, sandbox image, scored
dataset digest, CPU quota, and host all differ.

## Results

| Rank | Configuration | Reasoning | Median | Five timed runs (ms) | Agent time | Adapter/provider route |
|---:|---|---|---:|---|---:|---|
| 1 | [GPT-5.6 Sol (OpenCode 2)](gpt-5.6-sol-high-opencode2/) | high | 4685.9 ms | 4835.4, 4729.8, 4542.0, 4605.2, 4685.9 | 116.0 min | opencode2 to ChatGPT Codex OAuth to gpt-5.6-sol |

The successful submission produced byte-exact output on the held-out 1B-row
dataset. Scoring used the agent container with the network disconnected, 4
CPU-equivalents, 16 GiB, one untimed warmup, and five timed runs.

## Failed first attempts

- [GPT-5.6 Sol (OpenCode 2) first attempt](gpt-5.6-sol-high-opencode2-attempt-1/):
  The runner invoked `opencode2 run` with `--standalone` before the
  subcommand. OpenCode 2 rejected the flag, the agent exited after one second
  without creating `work/submission/run.sh`, and scoring failed at the missing
  submission boundary. The argv order was fixed in
  `90e269338838337efc802ca1e1734357f48fb783` before the successful session.

## Provenance

- Batch id: `opencode2-cloud-agent-2026-09-19`
- Exact harness commit (successful session): `90e269338838337efc802ca1e1734357f48fb783`
- Agent harness: `opencode2 v0.0.0-beta-19271`
- Prompt SHA-256: `dc40755a1e6c067e60d5c1159336678483db9ff74cce124ed74129c5f933b34e`
- Judge SHA-256: `1f3f8aeb0181e18248a253e54d0bfb23fec7c9166350c5be28f5447064cee2c1`
- In-container judge runner SHA-256: `b4a5c51b4143f81c2e2b18f50b4f016dd54a85c73bc5690540f523613c48edcc`
- Session runner SHA-256: `b6a242aacc2cd66b1376e65af26e6dbe644a911cf42ddc18d2e0c71276ecfc7b`
- Sandbox image: `sha256:b794b46f3f61c26a7811a0166962b867ba7bd484306ab2afab98ebdd87f794bb`
- Proxy image: `sha256:7d4e6261afa4c70de6fdd626e11f79d0dfe3ec73cba11fb78e754c8c0f7a55ac`
- Dataset SHA-256: `50bf18178cd265180197b03b03f5e7f25c1feea1c1b26e0c7301d8f5f04c5b8a`
  (generated from the same generator source as v0.5, but the byte digest
  differs from the v0.5 pin `59f83486…`; this session ran with
  `BENCH_ALLOW_OVERRIDE=1`)
- Generator source SHA-256: `efc83686387bfb2fd4b7d03c6e6248ff8828764758ae6dd32ea817a2207a093d`
- Hardware: Intel Xeon (cloud-agent), 4 physical cores / 4 logical CPUs,
  4 CPU quota, 16 GiB, cloud-ephemeral storage
- Warm-cache policy: one untimed warmup followed by five timed runs

The complete machine-readable record is [results.json](results.json).
Each bundle directory contains `SHA256SUMS` and an `omitted-files.json`
inventory. Published bundles retain the agent trace (`events.jsonl`,
`agent.err`, `pi.err`), scoring evidence, and the final submission
(`run.sh`, binary, and source). Intermediate experiments and scratch files
are omitted.

## Limits

- One agent session; no session-level variance estimate.
- Not comparable to v0.5 medians (different adapter, image, dataset digest,
  and hardware).
- Only classic 1BRC Round A was run; the anti-retrieval Round B was not run.
- The five-pass median measures the generated program after an untimed warmup;
  it does not measure cold-cache storage performance.
- Token and cost totals are omitted.
