#!/bin/sh
# Keep the agent container alive after pi exits so the final submission can be
# scored in the exact image/filesystem/toolchain that produced it.
set -u

status=0
pi "$@" || status=$?

printf '%s\n' "$status" > /run/1brc-lifecycle/agent.exit

# The host injects the held-out scored input and runs the judge through
# docker exec before releasing this container.
while [ ! -e /run/1brc-lifecycle/release ]; do
  sleep 1
done

exit "$status"
