#!/usr/bin/env python3
"""Judge-side coordinator: generate expected output and score a submission.

The benchmark path requires --container. The submission is then executed via
docker exec in the already-running agent container. --host is retained only
for explicit local scorer smoke tests and is not the benchmark path.

Usage: score.py --round A|B --input <measurements file> --submission <run.sh>
                  (--container <id> | --host) [--runs 5]

Pipeline:
  1. expected = reference(<input>)          (cached next to input)
  2. actual   = bash <run.sh> <input>       (timed, N runs, stdout captured)
     in the scoring container when --container is used
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

def status(message: str) -> None:
    print(f"[score] {message}", file=sys.stderr, flush=True)


def expected_output(round_id: str, input_path: str, expected_file: str | None = None) -> str:
    if expected_file:
        status(f"using cached expected output: {expected_file}")
        with open(expected_file) as f:
            return f.read().rstrip("\n")
    cache = input_path + f".expected-{round_id}"
    if os.path.exists(cache):
        status("using cached expected output")
        with open(cache) as f:
            return f.read().rstrip("\n")
    ref = os.path.join(HERE, "reference.py" if round_id == "A" else "reference-b.py")
    status("generating expected output with the judge reference")
    out = subprocess.run(
        [sys.executable, ref, input_path],
        capture_output=True, text=True, check=True,
    ).stdout.rstrip("\n")
    with open(cache, "w") as f:
        f.write(out + "\n")
    return out

def time_run_host(submission: str, input_path: str) -> tuple[float, str]:
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


def time_run_container(
    container: str,
    runner_path: str,
    submission_path: str,
    input_path: str,
) -> tuple[float, str]:
    """Run and time the submission inside the existing benchmark container."""
    try:
        proc = subprocess.run(
            [
                "docker",
                "exec",
                "-u",
                "1000:1000",
                container,
                "python3",
                runner_path,
                submission_path,
                input_path,
            ],
            capture_output=True,
            text=True,
            timeout=620,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("docker exec score helper exceeded 620s")

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout)[:500]
        raise RuntimeError(f"container score helper exited {proc.returncode}: {detail}")

    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        detail = (proc.stderr or proc.stdout)[:500]
        raise RuntimeError(f"container score helper returned invalid JSON: {detail}") from exc

    if result.get("timed_out"):
        raise RuntimeError("run.sh exceeded 600s per run — too slow, counts as DQ")
    if result.get("returncode") != 0:
        stderr = result.get("stderr", "")
        raise RuntimeError(
            f"run.sh exited {result.get('returncode')}: {stderr[:500]}"
        )
    return float(result["elapsed_ms"]), result.get("stdout", "").rstrip("\n")

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--round", choices=["A", "B"], required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--submission", required=True)
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument(
        "--expected-file",
        help="precomputed expected output; avoids opening --input on the host",
    )
    execution = ap.add_mutually_exclusive_group(required=True)
    execution.add_argument(
        "--container",
        help="running benchmark container id; submission executes inside it",
    )
    execution.add_argument(
        "--host",
        action="store_true",
        help="explicit local smoke-test mode; not used for benchmark scoring",
    )
    ap.add_argument(
        "--container-runner",
        default="/run/1brc/score_run.py",
        help="score helper path mounted inside the scoring container",
    )
    ap.add_argument(
        "--container-submission",
        default="/work/submission/run.sh",
        help="submission path inside the scoring container",
    )
    ap.add_argument(
        "--container-input",
        default="/data/measurements.txt",
        help="scored input path inside the scoring container",
    )
    args = ap.parse_args()

    if args.runs <= 0:
        ap.error("--runs must be positive")

    if not os.access(args.submission, os.X_OK):
        os.chmod(args.submission, 0o755)

    if args.container:
        run_once = lambda: time_run_container(
            args.container,
            args.container_runner,
            args.container_submission,
            args.container_input,
        )
        execution_environment = f"container:{args.container}"
    else:
        run_once = lambda: time_run_host(args.submission, args.input)
        execution_environment = "host-explicit-smoke"

    scoring_started = time.perf_counter()
    expected_started = time.perf_counter()
    expected = expected_output(args.round, args.input, args.expected_file)
    expected_ms = (time.perf_counter() - expected_started) * 1000.0
    status(f"expected output ready in {expected_ms / 1000.0:.1f}s")

    # warmup (untimed)
    status("running untimed warmup")
    try:
        run_once()
    except RuntimeError as e:
        print(json.dumps({"round": args.round, "correct": False, "reason": str(e)}, indent=2))
        sys.exit(1)

    times, actuals = [], []
    for i in range(args.runs):
        status(f"running timed pass {i + 1}/{args.runs}")
        ms, actual = run_once()
        times.append(ms)
        actuals.append(actual)

    correct = all(a == expected for a in actuals)
    result = {
        "round": args.round,
        "input": os.path.basename(args.input),
        "submission": args.submission,
        "execution_environment": execution_environment,
        "correct": correct,
        "median_ms": round(statistics.median(times), 1) if correct else None,
        "runs_ms": [round(t, 1) for t in times],
        "expected_ms": round(expected_ms, 1),
        "scoring_elapsed_ms": round((time.perf_counter() - scoring_started) * 1000.0, 1),
        "expected_sha256": hashlib.sha256(expected.encode()).hexdigest()[:16],
        "actual_sha256": hashlib.sha256(actuals[0].encode()).hexdigest()[:16],
    }
    print(json.dumps(result, indent=2))
    sys.exit(0 if correct else 1)

if __name__ == "__main__":
    main()
