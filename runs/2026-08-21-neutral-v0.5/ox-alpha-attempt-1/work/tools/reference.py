#!/usr/bin/env python3
"""Reference implementation + verifier for 1BRC-Agents.

Acts as:
  1. generator of the expected output (slow, obviously-correct Python)
  2. byte-exact comparator for a submission's actual output

Usage:
  reference.py <input>                          # prints expected output
  verify.py --round A --input F --actual FILE   # compare (wrapper)

Kept in one file so the agent could read it, but the agents get only the
verify wrapper in /work/tools — the expected output is never computed
inside the sandbox.
"""
import sys

def round_half_up_1(x: float) -> str:
    # 1BRC semantics: Math.round(mean*10)/10 — half rounds AWAY FROM ZERO
    # (Python's round() is banker's rounding; must not use it.)
    import math
    scaled = x * 10.0
    r = math.floor(scaled + 0.5) if scaled >= 0 else math.ceil(scaled - 0.5)
    v = r / 10.0
    s = f"{v:.1f}"
    return "0.0" if s == "-0.0" else s

def process(path: str) -> str:
    stats = {}  # name -> [min, max, sum, count]
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            name, _, temp = line.rpartition(";")
            t = float(temp)
            t10 = int(round(t * 10))  # exact int; input has 1 decimal
            s = stats.get(name)
            if s is None:
                stats[name] = [t10, t10, t10, 1]
            else:
                if t10 < s[0]: s[0] = t10
                if t10 > s[1]: s[1] = t10
                s[2] += t10
                s[3] += 1
    parts = []
    for name in sorted(stats):
        mn, mx, sm, cnt = stats[name]
        mean = round_half_up_1(sm / cnt / 10.0)
        parts.append(f"{name}={mn/10.0:.1f}/{mean}/{mx/10.0:.1f}")
    return "{" + ", ".join(parts) + "}"

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: reference.py <input>", file=sys.stderr)
        sys.exit(1)
    out = process(sys.argv[1])
    print(out)
