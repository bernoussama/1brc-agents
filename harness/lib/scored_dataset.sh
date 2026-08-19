#!/usr/bin/env bash
# Prepare and reuse the validated scored dataset in a named Docker volume.
# This file is sourced by run_session.sh and by prepare_scored_dataset.sh.

set -euo pipefail

scored_dataset_metadata_value() {
  local metadata="$1" key="$2"
  printf '%s\n' "$metadata" \
    | awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1); exit }'
}

scored_dataset_volume_test() {
  local expression="$1"
  docker run --rm -v "$SCORED_DATASET_VOLUME:/dataset:ro" \
    alpine:latest sh -c "$expression"
}

scored_dataset_volume_chmod() {
  local mode="$1"
  docker run --rm -u 0:0 -v "$SCORED_DATASET_VOLUME:/dataset" \
    alpine:latest chmod "$mode" /dataset/measurements.txt
}

scored_dataset_validate_host_file() {
  local file="$1" rows bytes last_byte
  rows="$(wc -l < "$file")"
  [ "$rows" -eq "$SCORED_DATASET_ROWS" ] || {
    echo "scored dataset row count is $rows, expected $SCORED_DATASET_ROWS: $file" >&2
    return 1
  }
  [ -s "$file" ] || { echo "scored dataset is empty: $file" >&2; return 1; }
  last_byte="$(tail -c 1 "$file" | od -An -t x1 | tr -d '[:space:]')"
  [ "$last_byte" = 0a ] || {
    echo "scored dataset does not end with a newline: $file" >&2
    return 1
  }
  bytes="$(stat -c %s "$file")"
  [ "$bytes" -gt 0 ] || { echo "scored dataset has zero bytes: $file" >&2; return 1; }

  SCORED_DATASET_BYTES="$bytes"
  SCORED_DATASET_SHA256="$(sha256sum "$file" | awk '{print $1}')"
}

scored_dataset_validate_volume() {
  local metadata="$1" volume_bytes volume_rows volume_sha
  volume_rows="$(scored_dataset_metadata_value "$metadata" rows)"
  volume_bytes="$(scored_dataset_metadata_value "$metadata" bytes)"
  volume_sha="$(scored_dataset_metadata_value "$metadata" sha256)"

  [ "$volume_rows" = "$SCORED_DATASET_ROWS" ] || return 1
  [ "$volume_bytes" -gt 0 ] || return 1
  [ -n "$volume_sha" ] || return 1
  volume_bytes="$(docker run --rm -v "$SCORED_DATASET_VOLUME:/dataset:ro" \
    alpine:latest stat -c %s /dataset/measurements.txt)"
  [ "$volume_bytes" = "$SCORED_DATASET_BYTES" ] || return 1

  if [ "${SCORED_DATASET_REVALIDATE:-0}" = 1 ]; then
    volume_rows="$(docker run --rm -v "$SCORED_DATASET_VOLUME:/dataset:ro" \
      alpine:latest sh -c 'wc -l < /dataset/measurements.txt')"
    [ "$volume_rows" = "$SCORED_DATASET_ROWS" ] || return 1
    volume_sha="$(docker run --rm -v "$SCORED_DATASET_VOLUME:/dataset:ro" \
      alpine:latest sha256sum /dataset/measurements.txt | awk '{print $1}')"
    [ "$volume_sha" = "$SCORED_DATASET_SHA256" ] || return 1
  fi
}

prepare_scored_dataset() {
  : "${SCORED_DATASET_VOLUME:?SCORED_DATASET_VOLUME is required}"
  : "${SCORED_DATASET_ROWS:?SCORED_DATASET_ROWS is required}"
  : "${SCORED_DATASET_GENERATOR_SOURCE:?SCORED_DATASET_GENERATOR_SOURCE is required}"
  : "${SCORED_DATASET_GENERATOR:?SCORED_DATASET_GENERATOR is required}"
  : "${SCORED_DATASET_IMAGE:?SCORED_DATASET_IMAGE is required}"
  : "${SCORED_DATASET_ROOT:?SCORED_DATASET_ROOT is required}"
  : "${SCORED_DATASET_ROUND:?SCORED_DATASET_ROUND is required}"

  [ -f "$SCORED_DATASET_GENERATOR_SOURCE" ] || {
    echo "missing sibling Java generator: $SCORED_DATASET_GENERATOR_SOURCE" >&2
    echo "set ONEBRC_ROOT to the 1brc checkout" >&2
    return 1
  }

  docker image inspect "$SCORED_DATASET_IMAGE" >/dev/null 2>&1 || \
    docker build -t "$SCORED_DATASET_IMAGE" "$SCORED_DATASET_ROOT/sandbox"
  docker volume inspect "$SCORED_DATASET_VOLUME" >/dev/null 2>&1 || \
    docker volume create "$SCORED_DATASET_VOLUME" >/dev/null

  SCORED_DATASET_GENERATOR_SOURCE_SHA256="$(
    sha256sum "$SCORED_DATASET_GENERATOR_SOURCE" | awk '{print $1}'
  )"
  SCORED_DATASET_REUSED=false

  local metadata="" expected_source expected_hash staging metadata_rows metadata_source
  if metadata="$(docker run --rm -v "$SCORED_DATASET_VOLUME:/dataset:ro" \
    alpine:latest sh -c 'test -f /dataset/dataset.meta && cat /dataset/dataset.meta' \
    2>/dev/null)"; then
    metadata_rows="$(scored_dataset_metadata_value "$metadata" rows)"
    metadata_source="$(scored_dataset_metadata_value "$metadata" generator_source_sha256)"
    if [ "$metadata_rows" != "$SCORED_DATASET_ROWS" ] || \
       [ "$metadata_source" != "$SCORED_DATASET_GENERATOR_SOURCE_SHA256" ]; then
      echo "scored dataset volume metadata does not match this benchmark" >&2
      echo "use a new SCORED_DATASET_VOLUME for a different generator/source" >&2
      return 1
    fi
    SCORED_DATASET_BYTES="$(scored_dataset_metadata_value "$metadata" bytes)"
    SCORED_DATASET_SHA256="$(scored_dataset_metadata_value "$metadata" sha256)"
    scored_dataset_validate_volume "$metadata" || {
      echo "scored dataset volume failed metadata/file validation" >&2
      return 1
    }
    SCORED_DATASET_REUSED=true
    echo "reusing validated scored dataset volume: $SCORED_DATASET_VOLUME" >&2
  else
    if docker run --rm -v "$SCORED_DATASET_VOLUME:/dataset:ro" \
      alpine:latest sh -c 'test -e /dataset/measurements.txt || test -e /dataset/dataset.meta' \
      >/dev/null 2>&1; then
      echo "scored dataset volume is incomplete and will not be overwritten: $SCORED_DATASET_VOLUME" >&2
      return 1
    fi

    staging="${SCORED_DATASET_STAGING:-$SCORED_DATASET_ROOT/data/.measurements-1b-staging.txt}"
    if [ ! -e "$staging" ]; then
      bash "$SCORED_DATASET_GENERATOR" "$SCORED_DATASET_ROWS" "$staging"
    else
      echo "using existing scored dataset staging file: $staging" >&2
    fi
    scored_dataset_validate_host_file "$staging"

    docker run --rm -u 0:0 \
      -v "$SCORED_DATASET_VOLUME:/dataset" \
      -v "$staging:/input:ro" \
      alpine:latest sh -c \
      'cp /input /dataset/measurements.txt && chmod 0600 /dataset/measurements.txt'

    docker run --rm -u 0:0 \
      -e "ROWS=$SCORED_DATASET_ROWS" \
      -e "BYTES=$SCORED_DATASET_BYTES" \
      -e "SHA256=$SCORED_DATASET_SHA256" \
      -e "GENERATOR_SOURCE_SHA256=$SCORED_DATASET_GENERATOR_SOURCE_SHA256" \
      -e "CREATED_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      -v "$SCORED_DATASET_VOLUME:/dataset" \
      alpine:latest sh -c \
      'printf "version=1\nrows=%s\nbytes=%s\nsha256=%s\ngenerator_source_sha256=%s\ncreated_utc=%s\n" \
        "$ROWS" "$BYTES" "$SHA256" "$GENERATOR_SOURCE_SHA256" "$CREATED_UTC" \
        > /dataset/dataset.meta && chmod 0444 /dataset/dataset.meta'

    if [ "${SCORED_DATASET_KEEP_STAGING:-0}" != 1 ]; then
      rm -- "$staging"
    fi
    echo "created and validated scored dataset volume: $SCORED_DATASET_VOLUME" >&2
  fi

  # The file is present in the scoring volume but unreadable by the UID-1000
  # agent. The host flips only the POSIX mode after pi exits; the Docker mount
  # remains read-only in the benchmark container throughout.
  scored_dataset_volume_chmod 0600

  if [ "$SCORED_DATASET_ROUND" = B ]; then
    SCORED_DATASET_REFERENCE_SOURCE="$SCORED_DATASET_ROOT/judge/reference-b.py"
  else
    SCORED_DATASET_REFERENCE_SOURCE="$SCORED_DATASET_ROOT/judge/reference.py"
  fi
  [ -f "$SCORED_DATASET_REFERENCE_SOURCE" ] || {
    echo "missing reference source: $SCORED_DATASET_REFERENCE_SOURCE" >&2
    return 1
  }
  expected_hash="$(sha256sum "$SCORED_DATASET_REFERENCE_SOURCE" | awk '{print $1}')"
  expected="${SCORED_DATASET_EXPECTED_OUTPUT:-$SCORED_DATASET_ROOT/data/.1brc-expected-${SCORED_DATASET_ROUND}-${expected_hash}-${SCORED_DATASET_SHA256}.txt}"
  SCORED_DATASET_EXPECTED_OUTPUT="$expected"

  if [ ! -s "$expected" ]; then
    local expected_tmp="${expected}.tmp.$$"
    mkdir -p "$(dirname "$expected")"
    echo "computing and caching Round $SCORED_DATASET_ROUND expected output once" >&2
    docker run --rm --network none \
      --cpus="${SCORED_DATASET_CPUS:-4}" \
      --memory="${SCORED_DATASET_MEM:-8g}" \
      --user 0:0 \
      -v "$SCORED_DATASET_VOLUME:/dataset:ro" \
      -v "$SCORED_DATASET_ROOT/judge:/judge:ro" \
      --entrypoint python3 \
      "$SCORED_DATASET_IMAGE" \
      "/judge/$(basename "$SCORED_DATASET_REFERENCE_SOURCE")" \
      /dataset/measurements.txt > "$expected_tmp"
    test -s "$expected_tmp"
    case "$(head -c 1 "$expected_tmp")" in
      '{') : ;;
      *) echo "reference output failed format validation: $expected_tmp" >&2; return 1 ;;
    esac
    mv -- "$expected_tmp" "$expected"
  else
    echo "reusing cached Round $SCORED_DATASET_ROUND expected output: $expected" >&2
  fi
}
