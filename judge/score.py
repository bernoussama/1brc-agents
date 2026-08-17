#!/usr/bin/env python3
"""Judge-side runner: generate expected output and score a submission.

Usage: score.py --round A|B --input <measurements file> --submission <run.sh> [--runs 5]

Pipeline:
  1. expected = reference(<input>)          (cached next to input)
  2. actual   = bash <run.sh> <input>       (timed, N runs, stdout captured)
  3. verdict  = byte-exact compare
  4. report   = {ok, median_ms, runs_ms[], output-hash, machine info}

Emits JSON to stdout. Exit code 0 iff correct.
"""
import argparse
import hashlib
import json
import os
import statistics
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))

def expected_output(round_id: str, input_path: str) -> str:
    cache = input_path + f".expected-{round_id}"
    if os.path.exists(cache):
        with open(cache) as f:
            return f.read().rstrip("\n")
    ref = os.path.join(HERE, "reference.py" if round_id == "A" else "reference-b.py")
    out = subprocess.run(
        [sys.executable, ref, input_path],
        capture_output=True, text=True, check=True,
    ).stdout.rstrip("\n")
    with open(cache, "w") as f:
        f.write(out + "\n")
    return out

def time_run(submission: str, input_path: str) -> tuple[float, str]:
    t0 = time.perf_counter()
    try:
        proc = subprocess.run(
            ["bash", submission, input_path],
            capture_output=True, text=True, timeout=600,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("run.sh exceeded 600s per run — too slow, counts as DQ")
    dt = (time.perf_counter() - t0) * 1000.0
    if proc.returncode != 0:
        raise RuntimeError(f"run.sh exited {proc.returncode}: {proc.stderr[:500]}")
    return dt, proc.stdout.rstrip("\n")

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--round", choices=["A", "B"], required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--submission", required=True)
    ap.add_argument("--runs", type=int, default=5)
    args = ap.parse_args()

    if not os.access(args.submission, os.X_OK):
        os.chmod(args.submission, 0o755)

    expected = expected_output(args.round, args.input)

    # warmup (untimed)
    try:
        time_run(args.submission, args.input)
    except RuntimeError as e:
        print(json.dumps({"round": args.round, "correct": False, "reason": str(e)}, indent=2))
        sys.exit(1)

    times, actuals = [], []
    for i in range(args.runs):
        ms, actual = time_run(args.submission, args.input)
        times.append(ms)
        actuals.append(actual)

    correct = all(a == expected for a in actuals)
    result = {
        "round": args.round,
        "input": os.path.basename(args.input),
        "submission": args.submission,
        "correct": correct,
        "median_ms": round(statistics.median(times), 1) if correct else None,
        "runs_ms": [round(t, 1) for t in times],
        "expected_sha256": hashlib.sha256(expected.encode()).hexdigest()[:16],
        "actual_sha256": hashlib.sha256(actuals[0].encode()).hexdigest()[:16],
    }
    print(json.dumps(result, indent=2))
    sys.exit(0 if correct else 1)

if __name__ == "__main__":
    main()
