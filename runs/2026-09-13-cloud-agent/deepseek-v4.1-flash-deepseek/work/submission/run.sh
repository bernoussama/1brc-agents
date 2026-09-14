#!/bin/sh
# 1BRC Round A submission
BIN=/work/solution/solve
if [ ! -x "$BIN" ]; then
  gcc -O3 -march=native -pthread -o "$BIN" /work/solution/solve.c || exit 1
fi
exec "$BIN" "$1" 4
