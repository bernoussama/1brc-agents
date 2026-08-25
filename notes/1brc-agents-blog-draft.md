# What coding agents do when you lock them in a box with a billion temperatures

*Draft. Explanation, not a results release. Numbers below mix the published
neutral-prompt v0.5 laptop batch with later cloud-agent sessions. Those are
different boxes. Do not rank them against each other.*

Gunnar Morling's One Billion Row Challenge asks a program to read a billion
`Station;temp` lines and print per-station min, mean, and max in a fixed
format. Humans already solved that problem hard. The interesting question for
agents is different. Can a model, left alone for a couple of hours, assemble a
correct fast submission from what it already knows, measure it, and keep
improving without a human steering the loop?

That is what [1BRC-Agents](https://github.com/bernoussama/1brc-agents) runs.

## The claim

Every serious 1BRC trick already lives in training data. mmap, custom hash
tables, SIMD semicolon scans, thread-local aggregation, half-up rounding.
Agents do not need to invent those. They need to pick among them, verify
byte-exact output, notice when a candidate is wrong or slow, and replace it
before the wall clock runs out.

Prime Intellect made a similar point for research agents. On this CPU task, the
gap is experimental discipline, not novelty.

## What the agent sees

The agent runs headless inside a pinned Docker sandbox. It gets:

- `program.md`, which defines Round A, classic 1BRC, and the submission
  contract at `/work/submission/run.sh`
- a 10M-row development file at `/data/measurements-dev.txt`
- toolchains already on the image, including gcc, clang, rustc, and GraalVM
- a logging HTTPS allowlist proxy for the model API only

It does not get general internet, package registries, or the scored file.
`/data/measurements.txt` may appear in the directory listing and still refuse
reads until after the agent process exits. Scoring happens in the same
container afterward, on the same filesystem and cgroup limits.

The frozen run profile is `bench.yml`. Host presets set CPU and memory. A
profile script supplies only the model and credentials. The session runner
starts the sandbox, injects one "read program.md and work until the budget
ends" message, and later runs the judge.

## How scoring works

Wrong output is a disqualification for that round. The judge compares the full
formatted string against a reference, not a checksum and not a sample.

Timing follows the original 1BRC idea. Preparation is free. Only processing
counts. After the agent exits, the harness unlocks the held-out 1B-row volume,
runs one untimed warmup, then five timed runs, and reports the median.

Published comparisons pin the image digest, the dataset hash, the generator
source hash, and the judge scripts. The v0.5 batch keeps full traces. That
record is the product as much as the median is.

## Two numbers you should not confuse

**Median of five timed runs** is the program the agent left behind, after
warmup, on the held-out file.

**Agent wall time** is how long the model spent building that program.

A short agent session can ship a mediocre binary. A long session can spend an
hour chasing SIMD variants and still lose to a cleaner mmap path. Time spent is
not quality. Quality is the median.

## What the published v0.5 batch showed

The canonical release is
[runs/2026-08-21-neutral-v0.5](../runs/2026-08-21-neutral-v0.5/). One laptop
(Intel Core i7-9750H, 6 CPU-equivalents, 16 GiB, NVMe), one session per
configuration, Round A only, n=1.

Top of that table:

| Configuration | Reasoning | Median |
|---|---|---:|
| Cursor Grok 4.6 Medium | medium | 1904.5 ms |
| GLM 5.3 | max | 1923.5 ms |
| GPT-5.6 Luna | max | 2403.7 ms |
| Gemini 3.7 Flash | high | 2989.7 ms |
| Ox Alpha | max | 3898.2 ms |

Grok and GLM sit 19 ms apart. Their timed ranges overlap. The release notes say
so plainly: the data does not support calling either one categorically better.

Two first attempts also failed before any submission existed. Those rows stay
in the archive so the batch history is not rewritten as an all-success story.

## A later cloud-agent pass, and why it is a different story

After v0.5 I ran more Round A sessions on Cursor cloud-agent VMs: 4
CPU-equivalents, 16 GiB, ephemeral storage, 120-minute budgets. Same task
shape, same judge protocol, different silicon and storage. Treat the table
below as a separate notebook, not an update to the laptop leaderboard.

| Configuration | Thinking | Correct | Median | Session |
|---|---|---|---:|---|
| gpt-5.6-sol | high | true | 1311.4 ms | `gpt-5.6-sol-high-20260824T153119` |
| glm-5.3 | profile default | true | 1729.1 ms | `glm-5.3-20260823T231939` |
| gpt-5.6-sol | medium | true | 3174.4 ms | `gpt-5.6-sol-medium-20260824T131831` |
| ox-alpha | high | true | 3954.6 ms | `ox-alpha-high-20260824T214625` |
| gpt-5.6-luna | max | true | 4610.3 ms | `gpt-5.6-luna-max-20260824T183125` |
| Cursor Grok 4.6 | medium | true | 5746.5 ms | `cursor-grok-4.6-medium-20260824T110152` |
| ox-alpha | max | true | 7256.5 ms | `ox-alpha-20260823T210214` |

Same-model thinking level moved the needle hard for sol. Medium landed at
3174.4 ms. High landed at 1311.4 ms on this host. ox-alpha moved the other way
relative to its own max run on the same cloud class. Max landed at 7256.5 ms.
High landed at 3954.6 ms.

I would not build a theory of reasoning budgets from two pairs. The setting is
still load-bearing. Put it in the profile name instead of burying it in a chat
transcript.

## Failure modes that are not about C

The interesting failures this week were not wrong averages.

OpenRouter's `stealth/ox-alpha` shared pool returned 429s often enough that
several high-thinking starts died before the first tool call. Auth was fine.
Capacity was not. A later start hit two 429s mid-session, recovered through
harness `auto_retry_end` with `success: true`, and kept working.

One ox-alpha high session ran for about 59 minutes, wrote a submission, then
lost the container before scoring. `score.json` recorded `correct: false` and
`No such container`. The restart finished cleanly. Agent exit 0, scoring in
30 seconds, median 3954.6 ms.

Grok on the same cloud host also showed how loud n=1 is. One medium session
landed at 3040.8 ms. Another landed at 5746.5 ms. Same label, same task,
different night. That spread is why the methodology asks for multiple
independent sessions before anyone calls a table a release ranking.

## What I think this measures well

It measures whether an agent can keep a valid `run.sh` on disk while it
experiments. It measures whether the agent uses `1brc-remaining-time` and
`1brc-resources` instead of guessing from wall clocks and `nproc`. It measures
whether the agent stops when output mismatches `verify.py`, or keeps shipping
broken parsers because the local timer looked fast.

It does not measure who invents a new 1BRC algorithm. Round B is the planned
contamination check. That round changes the aggregation and announces the
spec only when the session starts. The published v0.5 batch did not run it.

## Limits worth saying out loud

- n=1 per configuration unless a release says otherwise
- reasoning effort and provider routes differ across rows; the tables name them
- cloud-agent medians are not comparable to the laptop v0.5 medians
- the five-pass median is warm-cache processing time, not cold storage
- cross-provider token and cost totals are still not normalized

If you want the audited laptop numbers, read
[runs/2026-08-21-neutral-v0.5](../runs/2026-08-21-neutral-v0.5/). If you want
the construction rules, read [methodology.md](../methodology.md). If you want
to run a session, start at the root README and `harness/README.md`.

The short version is simple. Lock the box. Pin the image, dataset, and judge.
Let the agent work. Score the binary it left behind. The median is the claim.
Everything else is provenance.
