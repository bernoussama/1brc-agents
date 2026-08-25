# Measuring Autonomous Coding Agents on 1BRC

*Draft. Not a formal release. The published laptop batch and later cloud-agent
sessions are different boxes — do not rank them against each other.*

We want to measure how well coding agents can optimize a known systems
problem without a human in the loop. Claims about agent autonomy are
everywhere; convincing, pinned evaluations of long autonomous coding sessions
are still rare. To investigate, we built
[1BRC-Agents](https://github.com/bernoussama/1brc-agents): lock a model in a
pinned Docker sandbox, give it Gunnar Morling's One Billion Row Challenge, and
score the binary it leaves behind.

The first public batch is [neutral-prompt v0.5](../runs/2026-08-21-neutral-v0.5/)
— eight successful configurations on one laptop, plus two failed first
attempts kept in the archive. After that we ran a second notebook on Cursor
cloud-agent VMs (4 CPU / 16 GiB, 120-minute budgets) across more providers and
reasoning settings, including keyless OpenCode Zen free models.

While we do not claim that the fastest agent submission would win a human 1BRC
leaderboard on different silicon, the tight feedback loop — compile, verify,
measure, replace — makes this a useful testbed for autonomous coding
discipline.

We were especially interested in whether newer models and higher reasoning
budgets would spend the wall clock well, or just invent more candidates. Every
serious 1BRC trick already lives in training data. Agents do not need to invent
mmap, custom hash tables, or thread-local aggregation. They need to pick among
those ideas, keep a byte-exact `run.sh` on disk, and keep climbing until the
budget ends.

The most striking pattern so far is not a single magic algorithm. The gap shows
up in experimental hygiene: whether the agent trusts `1brc-remaining-time`
instead of guessing from wall clocks, whether it stops on `verify.py` failures,
whether it recovers from provider stream errors, and whether it keeps working
for the full budget instead of declaring victory early.

## Results at a glance

### Published batch — laptop, neutral-prompt v0.5

Single box (Intel Core i7-9750H, 6 CPU-equivalents, 16 GiB, NVMe). One session
per configuration. Round A only. `n=1`.

| Rank | Configuration | Reasoning | Median | Agent time | Route |
|---:|---|---|---:|---:|---|
| 1 | Cursor Grok 4.6 Medium | medium | **1904.5 ms** | 72.0 min | pi → in-container cursor-api-proxy → Cursor CLI |
| 2 | GLM 5.3 | max | **1923.5 ms** | 56.1 min | pi → Z.AI Coding Plan |
| 3 | GPT-5.6 Luna | max | 2403.7 ms | 79.8 min | pi → openai-codex OAuth |
| 4 | Gemini 3.7 Flash | high | 2989.7 ms | 19.4 min | pi → CLIProxyAPI → Antigravity |
| 5 | Ox Alpha | max | 3898.2 ms | 100.0 min | pi → OpenRouter `stealth/ox-alpha` |
| 6 | GPT-5.6 Terra | medium | 4661.3 ms | 9.3 min | pi → openai-codex OAuth |
| 7 | GPT-5.6 Sol | high | 5186.3 ms | 7.4 min | pi → openai-codex OAuth |
| 8 | GPT-5.6 Terra | max | 5905.4 ms | 43.1 min | pi → openai-codex OAuth |

Grok and GLM sit **19 ms** apart (1.0%). Their timed ranges overlap. The release
notes say so plainly: the data does not support calling either one
categorically better.

Two first attempts failed before any submission existed (Gemini after 2 s, Ox
Alpha after 17 s). Those rows stay in the archive so the batch history is not
rewritten as an all-success story.

Full provenance, SHA digests, and per-config bundles live in
[`runs/2026-08-21-neutral-v0.5/`](../runs/2026-08-21-neutral-v0.5/).

### Later notebook — cloud-agent host (separate box)

Same task shape and judge protocol. Different silicon and storage (Xeon,
4 CPU / 16 GiB, ephemeral disk, 120-minute budgets). **Not comparable** to the
laptop medians.

| Configuration | Thinking | Correct | Median | Notes |
|---|---|---|---:|---|
| gpt-5.6-sol | high | true | **1311.4 ms** | 1× WebSocket idle timeout recovered |
| MiniMax M3 `:free` | max | true | **3061.3 ms** | OpenRouter free; 9× auto-retry recovered |
| gpt-5.6-sol | medium | true | 3174.4 ms | |
| Grok 4.6 | high | true | 3953.1 ms | In-container cursor-api-proxy |
| ox-alpha | high | true | 3954.6 ms | Restart after container death; 2×429 recovered |
| gpt-5.6-luna | max | true | 4610.3 ms | |
| Grok 4.6 | medium | true | 5746.5 ms | Same host also saw 3040.8 ms on another night |
| Muse Spark free | xhigh | true | **6500.8 ms** | OpenCode Zen free, Responses API; full ~120 m (r1 early-exit: 8940.2 ms) |
| MiniMax M2.7 | max | true | 6562.3 ms | GMI Serving |
| ox-alpha | max | true | 7256.5 ms | |
| MiniMax M3 | max | true | 12225.6 ms | GMI Serving |

Same-model thinking level moved the needle hard for Sol on this host: medium
landed at 3174.4 ms, high at 1311.4 ms. Ox Alpha moved the other way relative
to its own max run. We would not build a theory of reasoning budgets from two
pairs — but the setting is load-bearing enough that it belongs in the profile
name, not buried in a chat transcript.

## Context

The task is classic 1BRC (Round A): read one billion `Station;temp` lines and
print per-station min / mean / max in a fixed format. Station names follow the
canonical Java generator (`dev.morling.onebrc.CreateMeasurements`). Wrong
output is a disqualification — exact string match against a frozen reference,
not a checksum and not a sample.

Humans already solved this problem hard. The agent question is different: can
a model, left alone for one or two hours, assemble a correct fast submission
from what it already knows, measure it, and keep improving?

Round B (planned, not run in v0.5) changes the aggregation and announces the
spec only when the session starts. That is the contamination check and
tiebreaker. Until Round B ships, treat Round A as a retrieval-and-discipline
benchmark, not an invention benchmark.

## Harness

Each run gets a rulebook, a sandbox, and one message. The rulebook —
[`task/program.md`](../task/program.md) — defines Round A, the submission
contract at `/work/submission/run.sh`, and how to use the box. At launch the
runner injects:

> Read program.md and follow it exactly. Run fully autonomously — never stop,
> never ask for input, never wait for a human. Goal: make
> `/work/submission/run.sh` the fastest CORRECT solution for Round A within
> your budget…

The agent runs headless inside a pinned Docker image on an internal network.
It sees its workdir, a 10M-row development file, preinstalled toolchains (gcc,
clang, rustc, GraalVM, …), and nothing else. The only route outside is a
logging HTTPS allowlist proxy for the model API. No web, no GitHub, no package
registries.

The scored 1B-row file may appear in directory listings and still refuse reads
until after the agent process exits. Scoring happens in the same container
afterward, on the same filesystem and cgroup limits, with the network
disconnected.

Authoritative time and resource commands are part of the contract:

- `1brc-remaining-time` — remaining budget and wrap-up phase
- `1brc-resources` — effective CPU quota and memory limit (not host `nproc`)
- `1brc-bounded` — kill an experiment process group after a deadline

The frozen run profile is [`bench.yml`](../bench.yml). Host presets set CPU and
memory. A profile script supplies only model identity and credentials. Each
session writes a manifest with image digest, dataset hash, generator source
hash, prompt hash, judge hashes, thinking level, and adapter route.

To claim a score, the agent must leave a valid `run.sh`. After the agent exits
(or the budget hard-stops), the harness unlocks the held-out volume, runs one
untimed warmup, then five timed runs, and reports the median. Preparation is
free; only processing counts — original 1BRC semantics.

These constraints come from earlier sessions where models would sleep through
the budget, trust wall clocks over `1brc-remaining-time`, or background a
"wrapup loop" and then emit a tool-less `stop` — leaving ~80 minutes unused
while believing a shell script would keep the agent alive. The harness cannot
fix bad research taste. It can refuse to reward it with a silent rewrite of
history.

## Results: where the gap comes from

This section is about process, not novelty. Across successful traces, agents
converge on the same family of ideas: mmap the file, parse temperatures
without `scanf`, aggregate in thread-locals, merge, format. The median is
usually decided by how carefully they iterate inside the budget.

**Two numbers you should not confuse**

- **Median of five timed runs** — the program left on disk, after warmup, on
  the held-out file.
- **Agent wall time** — how long the model spent building that program.

A short session can ship a mediocre binary. A long session can spend an hour
on SIMD variants and still lose to a cleaner mmap path. Time spent is not
quality. Quality is the median.

**Thinking level is a first-class variable**

On the cloud host, Sol high beat Sol medium by more than 2×. Ox Alpha high
beat Ox Alpha max on the same class of machine. Provider routes and reasoning
settings change the experiment. The tables name them; unpublished "default"
rows would erase the signal.

**Provider reliability is part of the run**

OpenRouter `stealth/ox-alpha` returned 429s often enough that early high
starts died before the first tool call. Later starts recovered through
harness auto-retry. Cursor / Codex streams sometimes ended without a terminal
event; pi retries and continues. Muse Spark on OpenCode Zen free consistently
failed Chat Completions (HTTP 500) and only worked on the Responses API —
with maximum effort `xhigh`, not `max`. Free routes are usable; they are not
quiet.

**Budget discipline separates samples of the same model**

Muse Spark free at `xhigh` is the cleanest illustration so far:

| Run | Agent time | Median | What happened |
|---|---:|---:|---|
| r1 | ~37 min | 8940.2 ms | Correct submission, then tool-less `stop` while a background wrapup loop was "supposed" to wait until wrap-up |
| r2 | ~120 min | **6500.8 ms** | Same profile; kept iterating / verifying until the harness hard-stopped into scoring |

Same model, same thinking, same host class. The second run closed about
27% of the gap to the cloud-table leaders relative to its own early exit —
not by inventing a new algorithm, but by staying in the loop. That is the
Prime Intellect finding restated for CPU: the ideas overlap; the climb does
not.

## Experimental taste (without the GPUs)

Prime Intellect's nanoGPT work shows models rebuilding screening protocols
around noise they measured themselves. On 1BRC the analogous moves are
smaller and more systems-shaped:

- Prefer `1brc-remaining-time` over sleep and wall-clock guesses.
- Bound every long experiment with `1brc-bounded`.
- Keep `run.sh` valid once the first correct version exists.
- Re-verify after every candidate; treat `verify.py` failure as hard stop for
  that binary, not a soft warning.
- Tune to container quota (`1brc-resources`), not host `nproc`.
- When the provider drops a stream, continue — do not treat a transport error
  as proof the recipe is dead.

Weaker traces kill families after one bad local timer, ship broken parsers
because "it looked fast," or exit early because a narrative wrap-up felt
complete. Stronger traces look boring in the event log: compile, verify,
measure, replace, check remaining seconds, repeat.

## Noise and confounding factors

This benchmark has real variance even when the judge is exact.

- **n=1 is loud.** Two Grok medium sessions on the same cloud host landed at
  3040.8 ms and 5746.5 ms on different nights. Methodology asks for ≥3
  independent sessions before calling a table a release ranking. v0.5 and the
  cloud notebook are both mostly n=1 and labeled that way.
- **Host is part of the score.** Laptop NVMe vs cloud ephemeral storage
  changes absolute medians. Cross-box ranking is a category error.
- **Warm cache only.** The five-pass median is after an untimed warmup. It is
  not a cold-storage number.
- **Adapter routes differ.** Codex OAuth, OpenRouter, GMI Serving, Cursor
  proxy, OpenCode Zen free — token and cost accounting are not yet normalized
  across them, so we omit cross-provider cost leaderboards for now.
- **Image / dataset pin drift.** Cloud sessions sometimes run with
  `BENCH_ALLOW_OVERRIDE=1` when the local image digest or dataset hash does
  not match `bench.yml`. Published comparisons must not.

## Related work

- [Gunnar Morling — The One Billion Row Challenge](https://www.morling.dev/blog/one-billion-row-challenge/)
  for the task.
- [Prime Intellect — Measuring Autonomous AI Research](https://www.primeintellect.ai/blog/measuring-autonomous-research)
  for the harness pattern we adapted: `program.md`, offline sandbox, frozen
  verifier, per-run manifests, long autonomous loops.
- [pi](https://pi.dev) — the coding-agent harness used for these sessions.

## Limits and conclusion

**Limits worth saying out loud**

- n=1 per configuration unless a release says otherwise
- Round B (anti-retrieval) not run in the published batch
- reasoning effort and provider routes differ across rows; tables name them
- cloud-agent medians are not comparable to laptop v0.5 medians
- five-pass median is warm-cache processing time
- cross-provider token/cost totals are not normalized
- no claim that agent medians beat human 1BRC records on this hardware

**What we think this measures well**

Whether an agent can keep a valid submission on disk while it experiments;
whether it uses the harness clocks and quotas; whether it stops on output
mismatch; whether it spends the budget. It does not measure who invents a new
1BRC algorithm.

**Short version**

Lock the box. Pin the image, dataset, and judge. Let the agent work. Score the
binary it left behind. The median is the claim. Everything else is provenance.

If you want the audited laptop numbers, read
[`runs/2026-08-21-neutral-v0.5/`](../runs/2026-08-21-neutral-v0.5/). If you want
the construction rules, read [`methodology.md`](../methodology.md). If you want
to run a session, start at the root README and `harness/README.md`.

## Citation

```bibtex
@misc{1brc-agents-2026,
  title        = {Measuring Autonomous Coding Agents on 1BRC},
  author       = {1BRC-Agents contributors},
  year         = {2026},
  howpublished = {\url{https://github.com/bernoussama/1brc-agents}},
  note         = {Draft blog; see runs/2026-08-21-neutral-v0.5 for the
                  published laptop batch}
}
```
