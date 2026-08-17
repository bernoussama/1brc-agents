#!/usr/bin/env python3
"""Round B reference (variant round — per-station median + stdev).

Revealed to the agent only at session start via the task prompt;
this reference stays judge-side.

Median: middle value (average of two middles for even counts), 1 decimal.
Stdev: population stddev, 2 decimals. Both rounded half-up.
"""
import math
import sys

def rhu(x: float, places: int) -> float:
    f = 10 ** places
    s = x * f
    r = math.floor(s + 0.5) if s >= 0 else math.ceil(s - 0.5)
    return r / f

def fmt(x: float, places: int) -> str:
    v = rhu(x, places)
    s = f"{v:.{places}f}"
    return f"0.{'0'*(places-1)}{s.split('.')[1]}" if s.startswith("-0.") and float(s) == 0 else s

def process(path: str) -> str:
    vals = {}  # name -> list of int (tenths)
    with open(path) as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            name, _, temp = line.rpartition(";")
            t10 = int(round(float(temp) * 10))
            vals.setdefault(name, []).append(t10)
    parts = []
    for name in sorted(vals):
        xs = sorted(vals[name])
        n = len(xs)
        if n % 2 == 1:
            med = xs[n // 2] / 10.0
        else:
            med = (xs[n // 2 - 1] + xs[n // 2]) / 2 / 10.0
        mean = sum(xs) / n / 10.0
        var = sum((x / 10.0 - mean) ** 2 for x in xs) / n
        sd = math.sqrt(var)
        parts.append(f"{name}={fmt(med,1)}/{fmt(sd,2)}")
    return "{" + ", ".join(parts) + "}"

if __name__ == "__main__":
    print(process(sys.argv[1]))
