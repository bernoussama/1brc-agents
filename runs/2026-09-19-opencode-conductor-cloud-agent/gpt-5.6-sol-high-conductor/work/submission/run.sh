#!/bin/sh
# 1BRC Round A submission: mmap + 4 pthreads C implementation.
BIN=/work/bin/1brc
if [ ! -x "$BIN" ]; then
    mkdir -p /work/bin
    cc -O3 -march=native -pthread -std=c11 -o "$BIN" /work/src/1brc.c || exit 1
fi
exec "$BIN" "$1"