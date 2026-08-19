#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="1brc-agents-sandbox:latest"

docker image inspect "$IMAGE" >/dev/null 2>&1 || {
  echo "missing image: $IMAGE" >&2
  exit 1
}

docker run --rm --network none --cap-add=PERFMON --user 1000:1000 \
  --entrypoint bash "$IMAGE" -lc '
    set -euo pipefail
    for tool in perf perl dot stackcollapse-perf.pl stackcollapse-go.pl stackcollapse-jstack.pl flamegraph.pl; do
      command -v "$tool" >/dev/null
    done

    perf stat -- sleep 0.05 >/dev/null 2> /tmp/perf.stat
    test -s /tmp/perf.stat

    printf "%s\\n" "main;worker 3" > /tmp/sample.folded
    flamegraph.pl /tmp/sample.folded > /tmp/sample.svg
    test -s /tmp/sample.svg
    grep -q "<svg" /tmp/sample.svg
    dot -V >/tmp/dot.version 2>&1
  '

echo "profiling tools: ok"
