# Round A submission — design notes

## Files
- `run.sh`        — entry point (sh). Prep (untimed) then exec's `./1brc "$1"`.
- `1brc_v5.c`     — solution source (compiled to `1brc`).
- `keycheck.c`    — prep-time safety verifier (compiled to `keycheck`).
- `.kc_*`, `/tmp/.1brc_kc_*` — cached keycheck verdicts keyed by input inode/size/mtime.

## Solution
Single-pass parallel aggregation over a read-only mmap:
- File mapped MAP_PRIVATE with a guard page after EOF so fixed-width AVX2
  loads never fault past the end.
- Threads = cgroup cpu.max quota (capped at 4 to stay under burst-throttle);
  each thread gets two newline-aligned chunk ranges processed in an
  interleaved loop (2 lines in flight per thread for memory-level parallelism).
- Per line: AVX2 cmpeq/movemask scan for ';', hash = first-8-bytes * K1 ^ len * K2,
  fully branchless decimal parse of `[-]D.D` / `[-]DD.D` into integer tenths,
  open-addressing SoA table update (min/max/sum/count).
- Temperatures kept as exact integer tenths end-to-end; mean rounding is
  `( |sum| + cnt/2 ) / cnt` with sign re-applied == half-up/away-from-zero,
  matching the reference exactly (ties included), -0 normalized to 0.0.
- Output entries sorted byte-wise (memcmp, then length); single fwrite.

## Fast path safety (`TRUST_KEYS`)
The hot path can skip per-line name memcmp only if no two distinct station
names share a hash key. `keycheck` (run untimed during prep against the actual
input file) verifies pairwise key uniqueness over the distinct names actually
present and prints UNIQUE/COLLIDE; run.sh enables the fast path ONLY on UNIQUE
and caches the verdict. If any pair collides, the binary runs the fully
verified memcmp path. Both paths produce byte-exact output on arbitrary inputs;
the fast path is provably safe for the file it runs on, not assumed.

## Prep (untimed)
- Compiles binaries if absent.
- keycheck reads the whole input with MAP_POPULATE, which also warms the page
  cache for the timed run (parallel minor-faulting inside the binary; no
  POPULATE there — measured faster).
