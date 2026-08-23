# 1BRC Round A — Final Solution Summary

## Architecture (solution.c → /work/submission/solution)
- **I/O**: single read-only mmap of the input (with 1MB zero-page guard so
  overreading past EOF is safe); file split into 6 chunks at newline boundaries.
- **Threads**: 6 workers (matches effective_cpu_cpus=6.0), each with its own
  hash table; merged at the end. ~97% parallel scaling.
- **Scan**: 64-byte windows; AVX2 compares produce 64-bit ';' and '\n' masks;
  per line: s = ctz(sm|nm), nl0 = ctz(nm); masks shifted lazily (refill every
  ~4.5 lines). Rare >64B lines use a bounded scalar fallback.
  Prefetch of p+192/p+256 hides DRAM latency of the streaming refill loads.
- **Temp parse**: fully branchless, end-anchored 8-byte load (digit nibbles),
  handles [-]d[d].d; negation via two's-complement trick.
- **Key**: a = bzhi(load64(line), 8*s)  (first ≤8 name bytes, zero-padded),
  w1 = bzhi(load64(line+8), 8*clamp(s-8,0..8)); exact match on
  (len, a, w1) for s ≤ 16 bytes; full tail memcmp for longer names —
  exact for arbitrary data (verified by 300+ differential fuzz tests vs
  reference.py, including prefix-collision and 16/17-byte boundary cases).
- **Table**: 8192 slots × 64B cache-line-aligned entries
  {a, w1, sum, count, min, max, len}, open addressing, hash = (a*K)>>51,
  ~1.03 probes/lookup; (sum,count) updated with one 16-byte SSE add.
- **Output**: replicates reference.py semantics bit-exactly, including the
  half-away-from-zero mean rounding chain ((double)sum/count/10*10 rounding),
  "%.1f" formatting and the "-0.0" → "0.0" fix; byte-wise lexicographic sort;
  trailing newline; LC_ALL pinned to C.

## Measured
- dev-scale 1.38GB/100M lines, warm: 0.19–0.21 s
- full-scale 13.8GB/1B-line judge simulation (5 consecutive runs):
  7.12 (cold) / 2.26 / 2.20 / 2.01 / 1.94  → median 2.20 s
- cold-cache run is volume-I/O bound (~1.9 GB/s effective thanks to
  per-thread MADV_WILLNEED parallel readahead); the 13.8GB file stays
  resident in the page cache within the 16GiB cgroup limit, so the
  median-of-5 reflects warm runs (~2.0 s on a quiet host).

## Validation
- verify.py byte-exact on /data/measurements-dev.txt
- edge cases: empty file, missing trailing newline, >64B names, prefix
  families, 8/9/16/17-byte boundaries, -0.0/0.0 temps, rounding ties
- 300+ randomized differential fuzz tests vs reference.py: all byte-exact
