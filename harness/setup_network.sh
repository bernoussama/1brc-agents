#!/usr/bin/env bash
# One-time host setup: the sandbox network + allowlist proxy + egress lock.
# Run with sudo (iptables). Safe to re-run.
#
#   sudo ./harness/setup_network.sh
#
# Topology:
#   1brc-agent-net (172.28.77.0/24, no internet)
#     ├── sandbox containers (egress LOCKED by DOCKER-USER rule)
#     └── 1brc-proxy @ 172.28.77.2 (also attached to default bridge = egress)
#   Sandbox reaches ONLY the proxy; proxy forwards HTTPS to ALLOW_DOMAINS.
#
# Proxy connection log (every allowed/denied connect): docker logs 1brc-proxy

set -euo pipefail

NET_NAME=1brc-agent-net
SUBNET=172.28.77.0/24
PROXY_IP=172.28.77.2

# Model APIs + their OAuth/token endpoints. Add providers here as needed.
ALLOW_DOMAINS="${ALLOW_DOMAINS:-api.openai.com,auth.openai.com,chatgpt.com,api.anthropic.com,api.deepseek.com,openrouter.ai,api.z.ai,z.ai,api.moonshot.cn,api.moonshot.ai}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

docker network inspect "$NET_NAME" >/dev/null 2>&1 \
  || docker network create --subnet "$SUBNET" "$NET_NAME"

docker build -q -t 1brc-allowlist-proxy "$ROOT/harness/proxy" >/dev/null

docker rm -f 1brc-proxy >/dev/null 2>&1 || true
docker run -d --name 1brc-proxy --restart unless-stopped \
  --network "$NET_NAME" --ip "$PROXY_IP" \
  -e ALLOW_DOMAINS="$ALLOW_DOMAINS" \
  1brc-allowlist-proxy >/dev/null

# proxy also joins the default bridge so it can reach the internet
docker network connect bridge 1brc-proxy 2>/dev/null || true

# Lock the sandbox subnet: everything except the proxy IP is dropped.
if ! iptables -C DOCKER-USER -s "$SUBNET" ! -d "$PROXY_IP" -j DROP 2>/dev/null; then
  iptables -I DOCKER-USER -s "$SUBNET" ! -d "$PROXY_IP" -j DROP
fi

echo "OK: network $NET_NAME, proxy at 172.28.77.2:3128, subnet locked."
echo "Verify: docker run --rm --network $NET_NAME curlimages/curl:8.16.0 -sI -x http://$PROXY_IP:3128 https://api.openai.com"
echo "        (and expect 403 for anything not in ALLOW_DOMAINS)"
