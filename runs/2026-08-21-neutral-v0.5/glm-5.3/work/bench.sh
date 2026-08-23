#!/bin/bash
# usage: bench.sh N bin1 bin2 ... — interleaved runs, medians
N=$1; shift
BINS=("$@")
declare -A RES
ARGS=(/tmp/big.txt)
run() { /usr/bin/time -f "%e" "$1" "${ARGS[@]}" 2>&1 >/dev/null | tail -1; }
for ((r=0;r<N;r++)); do
  for b in "${BINS[@]}"; do
    t=$(run "$b")
    RES[$b]="${RES[$b]} $t"
  done
done
for b in "${BINS[@]}"; do
  echo "$b: $(echo ${RES[$b]} | tr ' ' '\n' | sort -n | awk '{a[NR]=$1} END {print a[int((NR+1)/2)]}') (all:$(echo ${RES[$b]} | tr ' ' '\n' | sort -n | tr '\n' ' '))"
done
