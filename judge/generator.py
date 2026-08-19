#!/usr/bin/env python3
"""Legacy synthetic smoke-test generator for 1BRC-Agents.

Synthetic station names — deliberately NOT the official 1BRC list — so
hardcoded hash-tables tuned to the famous 413 keys buy you nothing.

The session runner uses the authoritative Java generator from the sibling
1brc checkout instead. Keep this utility for small, deterministic local
smoke tests that need arbitrary station names.

Usage: generator.py <rows> <seed> <output-path>
"""
import os
import random
import sys

ALPHABET = (
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "0123456789"
    " .'-()/&+"
)

def gen_name(rng: random.Random) -> str:
    n = rng.randint(4, 100)
    while True:
        # weight toward word-like names: mostly letters, occasional symbols
        chars = []
        for _ in range(n):
            r = rng.random()
            if r < 0.80:
                chars.append(rng.choice(ALPHABET[:52]))
            elif r < 0.94:
                chars.append(rng.choice(ALPHABET[52:62]))
            else:
                chars.append(rng.choice(ALPHABET[62:]))
        name = "".join(chars).strip()
        if len(name) >= 4 and ";" not in name:
            return name

def main() -> None:
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    rows, seed, path = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]

    rng = random.Random(seed)
    n_stations = 10_000
    stations = []
    seen = set()
    while len(stations) < n_stations:
        name = gen_name(rng)
        if name not in seen:
            seen.add(name)
            stations.append(name)

    # chunked buffered writing: 10M+ rows don't fit naive string building
    chunk = []
    chunk_size = 100_000
    with open(path, "w", buffering=1024 * 1024) as f:
        for i in range(rows):
            name = stations[rng.randrange(n_stations)]
            # 1 decimal, matching 1BRC value range
            temp = rng.randint(-999, 999) / 10.0
            chunk.append(f"{name};{temp:.1f}")
            if len(chunk) >= chunk_size:
                f.write("\n".join(chunk) + "\n")
                chunk = []
        if chunk:
            f.write("\n".join(chunk) + "\n")

    print(f"wrote {rows} rows, {n_stations} stations -> {path}", file=sys.stderr)

if __name__ == "__main__":
    main()
