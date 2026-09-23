#!/bin/sh
if [ ! -x /work/main ]; then
    gcc -O3 -march=native -pthread -o /work/main /work/main.c || exit 1
fi
exec /work/main "$1"
