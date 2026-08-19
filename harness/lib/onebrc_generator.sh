#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: onebrc_generator.sh <rows> <output-path>" >&2
  exit 2
fi

ROWS="$1"
OUTPUT="$2"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ONEBRC_ROOT="${ONEBRC_ROOT:-$ROOT/../1brc}"
SOURCE="$ONEBRC_ROOT/src/main/java/dev/morling/onebrc/CreateMeasurements.java"
JAR="$ONEBRC_ROOT/target/average-1.0.0-SNAPSHOT.jar"

if ! [[ "$ROWS" =~ ^[1-9][0-9]*$ ]] || [ "$ROWS" -gt 2147483647 ]; then
  echo "rows must be an integer between 1 and 2147483647: $ROWS" >&2
  exit 2
fi

[ ! -e "$OUTPUT" ] || {
  echo "refusing to overwrite existing output: $OUTPUT" >&2
  exit 1
}

if [ ! -f "$SOURCE" ] && [ ! -f "$JAR" ]; then
  echo "sibling 1BRC generator not found under $ONEBRC_ROOT" >&2
  echo "set ONEBRC_ROOT to the 1brc checkout" >&2
  exit 1
fi

OUTPUT_DIR="$(dirname "$OUTPUT")"
mkdir -p "$OUTPUT_DIR"
# Keep the potentially multi-gigabyte generated file on the same disk-backed
# filesystem as the destination. /tmp is a small tmpfs on the benchmark host.
BUILD_PARENT="${GENERATOR_TMPDIR:-$OUTPUT_DIR}"
mkdir -p "$BUILD_PARENT"
BUILD_DIR="$(mktemp -d "$BUILD_PARENT/.1brc-java-generator.XXXXXX")"
trap 'rm -rf -- "$BUILD_DIR"' EXIT

if [ -f "$SOURCE" ] && command -v javac >/dev/null 2>&1; then
  echo "using Java generator source: $SOURCE" >&2
  mkdir -p "$BUILD_DIR/classes"
  javac -d "$BUILD_DIR/classes" "$SOURCE"
  JAVA_CP="$BUILD_DIR/classes"
else
  [ -f "$JAR" ] || {
    echo "javac is required to compile $SOURCE and no built sibling jar exists" >&2
    exit 1
  }
  echo "using built Java generator: $JAR" >&2
  JAVA_CP="$JAR"
fi

(
  cd "$BUILD_DIR"
  java -cp "$JAVA_CP" dev.morling.onebrc.CreateMeasurements "$ROWS"
)

[ -f "$BUILD_DIR/measurements.txt" ] || {
  echo "Java generator did not produce measurements.txt" >&2
  exit 1
}

mv -- "$BUILD_DIR/measurements.txt" "$OUTPUT"
