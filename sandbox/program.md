# 1BRC-Agents — The Task

You are running in a sandboxed Linux container with NO network access.
Compilers and tools are installed: gcc, clang, rust (cargo), go, zig, python3.
Read this file, then act fully autonomously: never stop, never ask for input,
never wait for a human. If you think you're done, spend remaining time
verifying and improving your best solution.

## Goal

Write the fastest program that reads a measurements file and writes the
required output, then submit it. The score is processing time (the timed
run of your program over the file), median of 5 executions.

## The input

`/data/measurements-dev.txt` — a preview-scale dataset (~10M lines, ~130 MB)
for development. The scored dataset is the same format, larger, generated
with a different seed and different station names you have never seen.
It will be placed at `/data/measurements.txt` before scoring.

Format: one measurement per line:

    <station name>;<temperature>

- Station name: 4–100 bytes, printable non-`;` characters, generated
  uniformly at random (NOT the official 1BRC station list — do not hardcode).
  Around 10k distinct names. Names may contain spaces, digits, punctuation.
- Temperature: a decimal number with one fractional digit, e.g. `-12.3`,
  in `[-99.9, 99.9]`.
- File ends with a newline. Rows are shuffled.

## The output (Round A — classic)

Exactly the original 1BRC output format, written to stdout, nothing else:

    {Amsterdam=-1.0/3.3/18.0, Dnepropetrovsk=-3.0/8.0/17.5, ...}

- One entry per station, `name=min/mean/max`
- Entries sorted by name (byte-wise lexicographic order)
- min and max: exact observed values
- mean: sum/count rounded **half-up** to one decimal (original 1BRC rule:
  round(mean * 10) / 10 as in `Math.round` semantics — i.e. 0.05 rounds
  away from zero)
- No trailing newline/whitespace beyond the specified format

## The submission

Exactly one file: `/work/submission/run.sh`
- Must be executable, `#!/bin/sh` (or bash) shebang.
- MAY compile things (e.g. `gcc -O3 main.c -o /work/submission/a.out`).
- MUST then execute the program, passing the input path as `$1`, writing
  the result to stdout, and exit 0.
- Must read the file at `$1` — the path will be `/data/measurements.txt`
  at scoring time, which is DIFFERENT from the dev path. Do not hardcode
  paths other than via `$1`.
- Build step is untimed; only the run is timed. You may precompile during
  the session; run.sh should detect a prebuilt binary and skip rebuilding.

## Timing (suggested protocol)

Run your solution 3 times on the dev file and report your best time —
that's usually enough to know where you stand. The judge uses the median
of 5 runs on the scored file.

## Budget

You have a wall-clock session budget announced in the task prompt
(default 120 minutes). A judge script enforces it; when time is up the
best existing `run.sh` is what gets scored. Keep run.sh valid at ALL
times after your first working version — overwrite it only with versions
you believe are correct.

## Correctness gate

Wrong output = disqualified for the round, no partial credit. The judge
compares byte-exact against a reference implementation. Test carefully,
including rounding. Common failure: mean rounding (0.05 up), station sort
order (byte-wise, not locale), trailing characters.

## Allowed

- Any installed language/compiler: C, C++, Rust, Go, Zig, Python, etc.
- Any technique: threads, mmap, SIMD, custom hash tables, SWAR parsing.
- Writing anywhere under `/work` (your workspace).
- Reading `/data/measurements-dev.txt` (and any file you generate).

## Not allowed

- Network access (there is none — attempts will just fail and waste budget)
- Modifying anything outside `/work`
- Hardcoding station names, or outputs, from the official 1BRC list
- Guessing the scored dataset: it does not exist yet in this container

## Practical advice

- Start with a simple correct version, make run.sh valid early, then
  iterate on speed while keeping correctness.
- Validate with: `/work/tools/verify.py --round A --input <file> --actual <(bash /work/submission/run.sh <file>)`
  (it compares against the reference implementation).
- `perf` is available for profiling (may need `-e` fallbacks in-container).
