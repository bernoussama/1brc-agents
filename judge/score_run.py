#!/usr/bin/env python3
"""Run one submission pass inside the benchmark scoring container.

The host-side score coordinator invokes this helper with docker exec. Timing
is measured here so Docker exec startup overhead is not part of the submission
runtime.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: score_run.py <submission> <input>", file=sys.stderr)
        return 2

    submission, input_path = sys.argv[1:]
    started = time.perf_counter()
    try:
        proc = subprocess.run(
            ["bash", submission, input_path],
            capture_output=True,
            text=True,
            timeout=600,
        )
        result = {
            "returncode": proc.returncode,
            "elapsed_ms": (time.perf_counter() - started) * 1000.0,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "timed_out": False,
        }
    except subprocess.TimeoutExpired as exc:
        result = {
            "returncode": None,
            "elapsed_ms": (time.perf_counter() - started) * 1000.0,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timed_out": True,
        }

    print(json.dumps(result), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
