#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$ROOT/harness/lib/firewall.sh"

TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
RULE_LOG="$TEST_DIR/rules.log"

iptables() {
  case "$1" in
    -C) return 1 ;;
    -I) printf '%s\n' "$*" >> "$RULE_LOG" ;;
    -D) printf 'unexpected delete: %s\n' "$*" >&2; return 1 ;;
    *) printf 'unexpected iptables operation: %s\n' "$*" >&2; return 1 ;;
  esac
}

install_firewall_rules 172.28.77.2 172.28.77.0/24

test "$(sed -n '1p' "$RULE_LOG")" = "-I DOCKER-USER 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT"
test "$(sed -n '2p' "$RULE_LOG")" = "-I DOCKER-USER 2 -s 172.28.77.2 -j ACCEPT"
test "$(sed -n '3p' "$RULE_LOG")" = "-I DOCKER-USER 3 -s 172.28.77.0/24 ! -d 172.28.77.2 -j DROP"

echo "firewall tests: ok"
