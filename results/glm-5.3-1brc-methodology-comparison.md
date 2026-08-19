# Why the More Rigorous 1BRC Run Scored Worse

## Comparing two GLM 5.3 optimization sessions

The second GLM 5.3 run scored **5.239 seconds**, compared with **2.899 seconds** in the earlier run. At first glance, that looks like a regression. It is a regression on the judge's median, but it is not a simple failure of optimization.

Both agents wrote a specialized C solution. The earlier agent optimized a fast, direct `mmap` implementation on a 100-million-line local file and projected its result to 1B rows. The rerun generated a full 1B-row, 14.4 GB test file, diagnosed page-cache pressure under the container's 8 GB memory limit, and switched to an adaptive `mmap`/buffered-`pread` design. That diagnosis made the experiment more realistic, but the selected I/O path was slower on the official judge.

The engineering conclusion is therefore two-dimensional:

- **Leaderboard result:** the earlier implementation wins.
- **Methodology and diagnosis:** the rerun is stronger, because it measured the real scale and explained the storage bottleneck.

The best next implementation would combine the earlier fast path with the rerun's boundary hardening and I/O experiments, then measure both paths on the same controlled input and cache state.

## The experiment

The two sessions used the same model and provider, Round A, host class, Docker image, CPU allocation, Java-generator source, and judge protocol. The generator source hash was identical in both manifests. Each scored file was freshly generated, so the bytes and output hashes differ even though the row count and station set are the same.

| Dimension | Earlier run | Rerun |
|---|---:|---:|
| Run | `003813` | `102354` |
| Scored rows | 1,000,000,000 | 1,000,000,000 |
| Official input size | 13,795,504,042 bytes | 13,795,447,632 bytes |
| Local scale used during optimization | 100M rows, 1.435 GB | 1B rows, 14.357 GB |
| Agent active time | 47m 21s | 92m 24s |
| Authoritative remaining-time checks | none | 13 recorded results |
| Final I/O strategy | Whole-file `mmap` | `mincore`-selected `mmap` or buffered `pread` |
| Official correctness | pass | pass |
| Official median | **2,898.9 ms** | **5,238.8 ms** |
| Timed-run range | 2,602.1–4,634.1 ms | 5,074.6–6,386.5 ms |

The official judge performs an untimed warmup, five timed executions, and reports the median. It compares the complete formatted output, not merely a checksum or a sample. The recorded results are [the earlier score](../runs/glm-5.3-20260818T003813/score.json) and [the rerun score](../runs/glm-5.3-20260818T102354/score.json).

The local files used by the agents were not the hidden official input. Both agents generated their own benchmark files from the station names available in the development data. The rerun's full-scale file was about **4.1% larger** than the official Java-generated file. It was still valuable for exposing 1B-scale I/O behavior, but its timings should be treated as representative rather than identical to the judge workload.

## Methodology one: optimize the hot loop first

The earlier session moved quickly from a baseline to a highly tuned `mmap` parser. Its final submission is [main.c](../runs/glm-5.3-20260818T003813/work/submission/main.c), launched by [run.sh](../runs/glm-5.3-20260818T003813/work/submission/run.sh).

The final design used:

1. A read-only whole-file `mmap` with `MADV_SEQUENTIAL`.
2. Newline-aligned ranges processed by one thread per detected physical core; six threads won on this host.
3. A 32-byte AVX2 window to find the semicolon and newline with byte masks and `tzcnt`.
4. Branchless temperature parsing from an eight-byte load.
5. Thread-local open-addressed tables, followed by a merge and byte-wise sort.
6. Runtime AVX2/BMI2 dispatch with a scalar fallback.

The agent used `perf`, compiler experiments, thread-count sweeps, and edge cases. It found a real negative-zero formatting issue and fixed it. It validated against the 10M-line development file, additional 5M- and 100M-line files, and crafted inputs covering rounding ties, missing final newlines, blank lines, UTF-8, long names, and multiple thread counts.

The key methodological choice was to use a 100M-line file as the largest local performance target and extrapolate its throughput to 1B rows. That produced a projection of roughly 2.6–2.9 seconds, which happened to be close to the official 2.899-second median.

This approach was efficient because it kept the optimization loop fast and concentrated effort on the CPU hot path. It also left a known-good submission in place while experiments changed. Its weakness was that the 100M file did not expose the same memory-pressure regime as a 13.8 GB file under an 8 GB cgroup limit.

An independent post-run audit also found two scope limitations in the final code:

- The AVX2 path can issue unbounded loads near the logical end of an arbitrary `mmap`ped file. The canonical scored file did not trigger the fault, but a valid page-aligned tail can.
- The compressed key uses the first and last portions of a name plus its length rather than a full-name comparison. Distinct long names with matching key portions can be merged.

Those defects did not affect the fixed canonical dataset, but they mean the earlier result is a specialized contest entry rather than a generally safe parser. The detailed earlier audit is preserved in [GLM-5.3-benchmark-report.md](../runs/glm-5.3-20260818T003813/GLM-5.3-benchmark-report.md).

## Methodology two: measure the real storage regime

The rerun began similarly: a multithreaded AVX2 `mmap` parser, profiling, key-layout experiments, and development-file correctness checks. The methodology changed when the agent generated a full 1B-row local file and measured it directly.

The observed behavior was materially different from the development file:

- Development data looked compute-friendly and completed in milliseconds.
- The 13.8–14.4 GB workload took roughly 9–10 seconds for early candidates.
- The container reported an 8 GB memory limit, so the entire file could not remain in page cache.
- Repeated `mmap` scans caused page faults and cache-reclaim pressure rather than behaving like a purely in-memory parser.

The agent then measured several alternatives: buffered `pread`, `O_DIRECT`, page-cache residency, directional scans, `madvise`, `posix_fadvise`, and different buffer sizes. It found that buffered reads with per-thread 8 MB buffers gave a more predictable path under the memory cap. The final source is [v9.c](../runs/glm-5.3-20260818T102354/work/submission/v9.c).

The shipped design:

1. Samples residency with `mincore`.
2. Uses `mmap` when at least 90% of the file appears cached.
3. Otherwise uses buffered `pread` with an 8 MB per-thread ring and explicit carry handling for lines crossing buffer boundaries.
4. Uses six AVX2/BMI2 worker threads, selected by interleaved A/B measurements against eight threads.
5. Adds padded tail handling, thread-boundary checks, rounding tests, and a slow path for over-long names.

The agent tested ASAN-instrumented variants while debugging boundary and lifetime defects, cross-checked the full local file against an independent `mmap` implementation, ran 10 consecutive identical-output checks, tested thread counts from one through twelve, and simulated the judge's five-run protocol. It also used the new authoritative `1brc-remaining-time` tool 13 times. The agent still settled early—after 92.4 of 120 minutes—but it no longer relied only on model estimates of the remaining budget.

This is a stronger systems methodology: it found that the dominant cost was not just parsing. However, it also optimized for a particular memory-pressure diagnosis. A `pread` path avoids some page-fault and reclaim behavior, but it copies bytes from the kernel into user buffers. When the judge's access pattern favors direct mapped reads, that extra movement becomes a permanent cost.

## Why the slower result is plausible

The final programs are both C, both use SIMD, and both use six effective workers. The major difference is the data path:

```text
Earlier:  file -> mmap pages -> AVX2 parser -> local table
Rerun:    file -> pread -> 8 MB user buffer -> AVX2 parser -> local table
```

The earlier path has no explicit copy and has a shorter hot path when mapped pages are available. The rerun's path pays for buffered reads and boundary/carry management, but is less dependent on the page cache retaining a file larger than the memory limit.

The rerun measured approximately 2.3–3.4 GB/s in the storage-bound regime. Its official timed runs were 5.075–6.387 seconds, with a 5.239-second median. The earlier runs were faster but more variable: 2.602–4.634 seconds. Relative to its median, the earlier range was about 70%; the rerun's range was about 25%.

That leads to an important distinction:

- The earlier implementation was **faster on this judge sequence**.
- The rerun implementation was **more stable under the diagnosed cache constraint**.

The score gap is therefore consistent with an I/O tradeoff, not a language change or a correctness regression. It is not a perfectly controlled causal experiment, because the official inputs were freshly generated and the cache state was not reset identically between the two historical runs.

## Correctness is still contract-scoped

Both submissions passed the official fixed-contract test. That proves the output was correct for the generated station set and the judge's file shape. It does not prove arbitrary-input correctness.

The two agents made different key assumptions:

- The earlier code kept more of the name's ends in its key but did not compare every byte on a key match.
- The rerun verified that `(first eight bytes, length)` was injective over the 413 canonical names and used that cheaper key in its hot path.

The second assumption is excellent for the known station list and unsafe as a general parser contract. The same is true of fixed table and arena capacities. Before reusing either solution outside this benchmark, the implementation should compare full names on key matches, guard every vector and temperature load at the file boundary, and grow or explicitly document its capacity limits.

## What the two sessions teach us

### 1. Development scale can hide the real bottleneck

A 138 MB file is useful for correctness and compiler iteration. It is not enough to decide between `mmap`, buffered reads, and direct I/O for a 14 GB workload.

### 2. Full-scale measurements need workload provenance

The rerun was right to create a 1B-row local file, but that file came from a custom C generator and was 4.1% larger than the hidden Java-generated input. The next harness version should expose a reproducible, non-secret full-scale fixture or record the exact generator distribution used for local experiments.

### 3. Median alone is not enough for systems optimization

The judge's median is the acceptance metric, but the raw runs reveal cache and scheduling behavior. Future reports should show median, range, and preferably IQR, alongside CPU, page-fault, and cache-residency data.

### 4. Robustness and score are separate axes

The earlier code won speed while carrying unsafe-input assumptions. The rerun spent more effort on boundaries and cache behavior but still specialized its station key. A good benchmark report must state both the score and the validity envelope.

### 5. Time instrumentation improves process observability, not automatically the score

The rerun used authoritative remaining-time checks and stayed active much longer. It still settled with about 27.6 minutes left, so the harness should continue treating `agent_exit` and `budget_deadline` as separate outcomes if “optimize until time runs out” is a requirement.

## Recommended next experiment

Build a third candidate with:

1. The earlier direct-`mmap` hot loop and six-thread configuration.
2. The rerun's padded-tail and line-boundary protections.
3. Full-name equality after a compact hash/key match.
4. A genuine safe fallback for files that are not mostly cached, rather than choosing `pread` solely from a one-time residency sample.

Then run the two I/O paths as a paired A/B test on the same official-size input, with a documented cache state and randomized order. Record correctness, median, range, page faults, CPU time, and bytes read. That experiment would separate algorithmic improvement from cache history and determine whether the rerun's stability is worth its throughput cost.

## Bottom line

The earlier GLM 5.3 session produced the better benchmark entry: **2.899 seconds versus 5.239 seconds**. The rerun produced the better explanation of what happens at 1B scale: the workload becomes storage- and cache-behavior-sensitive, not merely a SIMD parsing exercise.

The engineering answer is not to discard the slower run. It is to use its diagnosis to make the faster `mmap` design safe, retain a measured fallback for memory pressure, and rerun the comparison under controlled I/O conditions.

### Evidence

- [Earlier score](../runs/glm-5.3-20260818T003813/score.json) and [manifest](../runs/glm-5.3-20260818T003813/manifest.yaml)
- [Rerun score](../runs/glm-5.3-20260818T102354/score.json) and [manifest](../runs/glm-5.3-20260818T102354/manifest.yaml)
- [Earlier final source](../runs/glm-5.3-20260818T003813/work/submission/main.c)
- [Rerun final source](../runs/glm-5.3-20260818T102354/work/submission/v9.c)
- [Earlier agent trace](../runs/glm-5.3-20260818T003813/pi-home/.pi/agent/sessions/--work--/2026-08-18T00-42-24-995Z_01a01251-c963-7a67-b546-f505dd398c80.jsonl)
- [Rerun agent trace](../runs/glm-5.3-20260818T102354/pi-home/.pi/agent/sessions/--work--/2026-08-18T10-27-05-057Z_01a01469-10e1-7eb6-bb72-30cbd8e61fa8.jsonl)
