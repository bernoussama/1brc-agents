#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

test -x "$ROOT/harness/lib/agent_entrypoint.sh"
test -f "$ROOT/harness/tests/fixtures/score-ok.sh"
bash -n "$ROOT/harness/run_session.sh" "$ROOT/harness/lib/agent_entrypoint.sh"
python3 -m py_compile "$ROOT/judge/score.py" "$ROOT/judge/score_run.py"

# The in-container timing helper must emit machine-readable results without
# leaking the submission's stdout into the coordinator's protocol.
RESULT="$(python3 "$ROOT/judge/score_run.py" \
  "$ROOT/harness/tests/fixtures/score-ok.sh" /dev/null)"
python3 - "$RESULT" <<'PY'
import json
import sys

result = json.loads(sys.argv[1])
assert result["returncode"] == 0
assert result["timed_out"] is False
assert result["stdout"] == ""
assert result["elapsed_ms"] >= 0
PY

# Host execution remains available only when explicitly requested. Omitting
# the execution boundary must not silently reintroduce host-side benchmark
# scoring.
if python3 "$ROOT/judge/score.py" \
  --round A --input /dev/null --submission /bin/true >/dev/null 2>&1; then
  echo "score.py accepted an unspecified execution boundary" >&2
  exit 1
fi

grep -Fq -- '--container "$CID"' "$ROOT/harness/run_session.sh" || {
  echo "run_session.sh does not invoke container scoring" >&2
  exit 1
}
grep -Fq -- "score_execution: same_agent_container" "$ROOT/harness/run_session.sh" || {
  echo "run_session.sh does not record container scoring" >&2
  exit 1
}

echo "same-container scoring handoff: ok"

IMAGE="1brc-agents-sandbox:latest"
NETWORK="1brc-agent-net"
if docker image inspect "$IMAGE" >/dev/null 2>&1 && \
   docker network inspect "$NETWORK" >/dev/null 2>&1; then
  TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/1brc-score-container.XXXXXX")"
  CID=""
  VOLUME="1brc-score-smoke-volume-$$"
  cleanup() {
    touch "$TEST_DIR/lifecycle/release" 2>/dev/null || true
    [ -z "$CID" ] || docker rm -f "$CID" >/dev/null 2>&1 || true
    docker volume rm "$VOLUME" >/dev/null 2>&1 || true
    rm -rf -- "$TEST_DIR"
  }
  trap cleanup EXIT

  mkdir -p "$TEST_DIR/work/submission" "$TEST_DIR/lifecycle" "$TEST_DIR/pi-home" "$TEST_DIR/data"
  ln -s /score-data/measurements.txt "$TEST_DIR/data/measurements.txt"
  if ! ln "$ROOT/harness/tests/fixtures/measurements-one.txt" \
    "$TEST_DIR/data/measurements-dev.txt" 2>/dev/null; then
    cp "$ROOT/harness/tests/fixtures/measurements-one.txt" \
      "$TEST_DIR/data/measurements-dev.txt"
  fi
  cp "$ROOT/harness/tests/fixtures/score-volume-fixed.sh" \
    "$TEST_DIR/work/submission/run.sh"
  chmod +x "$TEST_DIR/work/submission/run.sh"
  docker volume create "$VOLUME" >/dev/null
  docker run --rm -u 0:0 \
    -v "$VOLUME:/dataset" \
    -v "$ROOT/harness/tests/fixtures/measurements-one.txt:/input:ro" \
    alpine:latest sh -c 'cp /input /dataset/measurements.txt && chmod 0600 /dataset/measurements.txt'
  docker run --rm \
    -v "$TEST_DIR/work:/w" \
    -v "$TEST_DIR/lifecycle:/l" \
    alpine:latest chown -R 1000:1000 /w /l

  NAME="1brc-score-smoke-$$"
  docker run --detach \
    --name "$NAME" \
    --network "$NETWORK" \
    --init \
    --user 1000:1000 \
    -e PATH=/tmp:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    -v "$ROOT/harness/tests/fixtures/score-ok.sh:/tmp/pi:ro" \
    -v "$ROOT/harness/lib/agent_entrypoint.sh:/usr/local/bin/1brc-agent-entrypoint:ro" \
    -v "$TEST_DIR/lifecycle:/run/1brc-lifecycle" \
    -v "$VOLUME:/score-data:ro" \
    -v "$TEST_DIR/work:/work" \
    -v "$TEST_DIR/data:/data:ro" \
    -v "$ROOT/judge/score_run.py:/run/1brc-score-run.py:ro" \
    --entrypoint /usr/local/bin/1brc-agent-entrypoint \
    "$IMAGE" smoke >"$TEST_DIR/container-id"
  CID="$(cat "$TEST_DIR/container-id")"

  for _ in $(seq 1 30); do
    [ -f "$TEST_DIR/lifecycle/agent.exit" ] && break
    sleep 1
  done
  test -f "$TEST_DIR/lifecycle/agent.exit"
  docker network disconnect "$NETWORK" "$CID" >/dev/null 2>&1 || true
  docker run --rm -u 0:0 -v "$VOLUME:/dataset" \
    alpine:latest chmod 0444 /dataset/measurements.txt

  SCORE_JSON="$(python3 "$ROOT/judge/score.py" \
    --round A \
    --input "$ROOT/harness/tests/fixtures/measurements-one.txt" \
    --submission "$TEST_DIR/work/submission/run.sh" \
    --container "$CID" \
    --container-runner /run/1brc-score-run.py \
    --runs 1)"
  python3 - "$SCORE_JSON" <<'PY'
import json
import sys

result = json.loads(sys.argv[1])
assert result["correct"] is True
assert result["execution_environment"].startswith("container:")
assert result["runs_ms"]
PY

  touch "$TEST_DIR/lifecycle/release"
  docker wait "$CID" >/dev/null
  docker rm -f "$CID" >/dev/null 2>&1 || true
  CID=""
  docker volume rm "$VOLUME" >/dev/null
  trap - EXIT
  rm -rf -- "$TEST_DIR"
  echo "Docker same-container score smoke: ok"
else
  echo "Docker same-container score smoke: skipped (image or network unavailable)"
fi
