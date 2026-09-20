# OpenCode conductor + Codex Luna max session (2026-09-20)

This is **not** part of the published [neutral-prompt v0.5](../2026-08-21-neutral-v0.5/)
leaderboard, and it is **not** comparable to the solo Sol-high OpenCode 2
session in [2026-09-19-opencode2-cloud-agent](../2026-09-19-opencode2-cloud-agent/),
the DeepSeek `#max` conductor session in
[2026-09-19-opencode-conductor-cloud-agent](../2026-09-19-opencode-conductor-cloud-agent/),
or the OpenRouter preset conductor session in
[2026-09-20-opencode-conductor-preset-cloud-agent](../2026-09-20-opencode-conductor-preset-cloud-agent/).
It is a single unofficial Round A session of native OpenCode 2 (`opencode2`)
with the vendored [opencode-conductor](https://github.com/bernoussama/opencode-conductor)
plugin: GPT-5.6 Sol high is the `conductor` primary; workers are GPT-5.6 Luna
`#max`. Both go through ChatGPT/Codex OAuth.

Do not compare these medians to v0.5 or to the other OpenCode 2 sessions. The
adapter, worker model, sandbox image, scored dataset digest, CPU quota, and
host all differ.

## Results

| Rank | Configuration | Reasoning | Median | Five timed runs (ms) | Agent time | Adapter/provider route |
|---:|---|---|---:|---|---:|---|
| 1 | [GPT-5.6 Sol high conductor + Luna `#max` workers](gpt-5.6-sol-high-conductor-luna/) | high / max | 13628.0 ms | 14231.8, 14168.2, 13612.8, 13464.3, 13628.0 | 109.1 min | opencode2 conductor openai/gpt-5.6-sol#high via ChatGPT Codex OAuth; workers openai/gpt-5.6-luna#max via Codex |

The successful submission produced byte-exact output on the held-out 1B-row
dataset. Scoring used the agent container with the network disconnected, 4
CPU-equivalents, 16 GiB, one untimed warmup, and five timed runs. The agent
exited on its own (`stop_reason: agent_exit`, container exit 1) after 6545 s
with a correct submission; score exit status was 0.

Tool activity stalled for about an hour after a newline-scan candidate, then
the last `conductor/coder` call (`Implement vector scanner`) failed. The
conductor still ended with a valid `run.sh`.

## Provenance

- Batch id: `opencode-conductor-luna-cloud-agent-2026-09-20`
- Exact harness commit (successful session): `5178b9e4568059a6c0849b16eae52c0e2909fbbd`
- Agent harness: `opencode2 v0.0.0-beta-19271`
- Plugin pin: `a24df9464a3cb2897a1da01da60a0383aa629685`
- Prompt SHA-256: `dc40755a1e6c067e60d5c1159336678483db9ff74cce124ed74129c5f933b34e`
- Judge SHA-256: `1f3f8aeb0181e18248a253e54d0bfb23fec7c9166350c5be28f5447064cee2c1`
- In-container judge runner SHA-256: `b4a5c51b4143f81c2e2b18f50b4f016dd54a85c73bc5690540f523613c48edcc`
- Session runner SHA-256: `d2b769876d684a5768234befdfb91a9f9d08fab3be75b6f9e4f7a68c02c5a9e0`
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
Published bundles retain the agent trace (`events.jsonl`, `pi.err`), scoring
evidence, and the final submission (`run.sh`, `measurements` binary, and
`main.cpp`). Intermediate experiment binaries are omitted. The conductor did
not call first-class `1brc_remaining_time` / `1brc_resources` tools.

## Limits

- One agent session; no session-level variance estimate.
- Not comparable to v0.5, solo Sol-high OpenCode 2, DeepSeek `#max` workers,
  or OpenRouter preset workers.
- Only classic 1BRC Round A was run; the anti-retrieval Round B was not run.
- The five-pass median measures the generated program after an untimed warmup;
  it does not measure cold-cache storage performance.
- Token and cost totals are omitted.
