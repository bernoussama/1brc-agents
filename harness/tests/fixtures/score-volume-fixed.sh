#!/bin/sh
set -eu
test "$(cat "$1")" = 'A;1.0'
printf '%s' '{A=1.0/1.0/1.0}'
