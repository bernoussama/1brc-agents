#!/usr/bin/env bash
set -euo pipefail

[ "$#" -eq 2 ]
[ "$1" = 1 ]
[ ! -e "$2" ]
printf '%s\n' 'A;1.0' > "$2"
