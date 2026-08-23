#!/bin/sh
# 1BRC Round A fast solver (AVX2, 6 threads, direct-mapped hash slots).
# The binary is prebuilt; recompile only if missing (preparation is untimed).
LC_ALL=C
export LC_ALL
DIR=/work/submission
if [ ! -x "$DIR/solution" ]; then
    gcc -O3 -march=native -falign-loops=64 -o "$DIR/solution" /work/solution.c -lpthread -lm || exit 1
fi
exec "$DIR/solution" "$1"
