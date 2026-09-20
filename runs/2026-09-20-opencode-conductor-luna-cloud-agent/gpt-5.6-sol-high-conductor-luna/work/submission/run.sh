#!/bin/sh
set -e
exec "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/measurements" "$1"
