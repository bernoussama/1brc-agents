#!/usr/bin/env python3
"""Sandbox-side verify wrapper the agent may call.

Computes the reference output in-sandbox on DEV data only. This exists so
the agent can self-check without network; the judge never uses it — judge
scoring happens outside the sandbox with fresh data.
"""
import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))

def main() -> int:
    if len(sys.argv) < 3:
        print("usage: verify.py <input> --actual <(bash run.sh <input>) | verify.py <input> <actual-file>", file=sys.stderr)
        return 1
    inp, actual_file = sys.argv[1], sys.argv[2]
    ref = os.path.join(HERE, "reference.py")
    expected = subprocess.run(
        [sys.executable, ref, inp], capture_output=True, text=True, check=True
    ).stdout
    try:
        actual = open(actual_file).read()
    except OSError as e:
        print(f"cannot read actual: {e}", file=sys.stderr)
        return 1
    if actual.rstrip("\n") == expected.rstrip("\n"):
        print("OK — byte-exact match")
        return 0
    print("MISMATCH")
    e_lines, a_lines = expected.splitlines(), actual.splitlines()
    for i in range(max(len(e_lines), len(a_lines))):
        e = e_lines[i] if i < len(e_lines) else "<missing>"
        a = a_lines[i] if i < len(a_lines) else "<missing>"
        if e != a:
            print(f"line {i}:")
            print(f"  expected: {e[:200]}")
            print(f"  actual:   {a[:200]}")
            break
    return 1

if __name__ == "__main__":
    sys.exit(main())
