#!/bin/bash
set -e
DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SRC="$DIR/1brc.c"
BIN="$DIR/1brc"
if [ ! -x "$BIN" ] || [ "$SRC" -nt "$BIN" ]; then
  gcc -O3 -march=native -pthread -fprofile-generate="$DIR" -fomit-frame-pointer -o "$BIN" "$SRC"
  "$BIN" "$1" >/dev/null
  gcc -O3 -march=native -pthread -flto -fomit-frame-pointer -funroll-loops -fno-stack-protector -fprofile-use="$DIR" -o "$BIN" "$SRC" 2>/dev/null || \
    gcc -O3 -march=native -pthread -flto -fomit-frame-pointer -funroll-loops -fno-stack-protector -o "$BIN" "$SRC"
fi
exec "$BIN" "$1"
