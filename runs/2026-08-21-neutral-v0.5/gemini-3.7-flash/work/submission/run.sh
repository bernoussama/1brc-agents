#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$DIR/solution"

if [ ! -f "$BIN" ]; then
    gcc -O3 -march=native -mavx2 -msse4.2 -mbmi2 -flto -fno-stack-protector -fno-plt -fomit-frame-pointer -pthread "$DIR/solution.c" -lm -o "$BIN"
fi

exec "$BIN" "$1"
