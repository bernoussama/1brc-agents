#!/usr/bin/env bash
# One-time host setup: the sandbox network + allowlist proxy + egress lock.
# Run with sudo (iptables). Safe to re-run.
#
#   sudo ./harness/setup_network.sh
#
# Topology:
#   1brc-agent-net (172.28.77.0/24, Docker-internal)
#     ├── sandbox containers (egress LOCKED by the internal network + rule)
#     └── 1brc-proxy @ 172.28.77.2 (also attached to default bridge = egress)
#   Sandbox reaches ONLY the proxy; proxy forwards HTTPS to ALLOW_DOMAINS and
#   exposes one fixed local bridge for the host CLIProxyAPI service.
#
# Proxy connection log (every allowed/denied connect): docker logs 1brc-proxy

set -euo pipefail

NET_NAME=1brc-agent-net
SUBNET=172.28.77.0/24
PROXY_IP=172.28.77.2
FORWARDER_NAME=1brc-cliproxyapi-forwarder
BRIDGE_VOLUME=1brc-cliproxyapi-bridge
LOCAL_FORWARD_PORT="${LOCAL_FORWARD_PORT:-8317}"
LOCAL_FORWARD_TARGET_PORT="${LOCAL_FORWARD_TARGET_PORT:-8317}"
LOCAL_FORWARD_SOCKET=/bridge/cliproxyapi.sock

# Model APIs + their OAuth/token endpoints. Add providers here as needed.
# cursor.sh covers api2/api3/api5 and any other Cursor API vhost.
ALLOW_DOMAINS="${ALLOW_DOMAINS:-api.openai.com,auth.openai.com,chatgpt.com,api.anthropic.com,api.deepseek.com,openrouter.ai,opencode.ai,api.z.ai,z.ai,api.moonshot.cn,api.moonshot.ai,api.gmi-serving.com,cursor.sh,cursor.com}"
# 0 = do not kill idle CONNECT tunnels. Long Cursor thinking/tool turns can
# go minutes without bytes on the TLS stream; a short idle timeout surfaces
# as pi errorMessage "terminated".
PROXY_IDLE_TIMEOUT_MS="${PROXY_IDLE_TIMEOUT_MS:-0}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/harness/lib/firewall.sh"

die() {
  echo "error: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || die "run as root, for example: sudo ./harness/setup_network.sh"
command -v docker >/dev/null 2>&1 || die "docker is required"
command -v iptables >/dev/null 2>&1 || die "iptables is required"
iptables -L DOCKER-USER -n >/dev/null 2>&1 \
  || die "Docker's DOCKER-USER chain is not available"

cleanup_on_error() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker rm -f 1brc-proxy >/dev/null 2>&1 || true
    docker rm -f "$FORWARDER_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup_on_error EXIT

# Disable any previous proxy before doing work that can fail. The internal
# network remains fail-closed while this script is incomplete.
docker rm -f 1brc-proxy >/dev/null 2>&1 || true
docker rm -f "$FORWARDER_NAME" >/dev/null 2>&1 || true

if docker network inspect "$NET_NAME" >/dev/null 2>&1; then
  internal="$(docker network inspect -f '{{.Internal}}' "$NET_NAME")"
  [ "$internal" = true ] \
    || die "network $NET_NAME already exists but is not internal; recreate it before running sessions"
  configured_subnet="$(docker network inspect -f '{{(index .IPAM.Config 0).Subnet}}' "$NET_NAME")"
  [ "$configured_subnet" = "$SUBNET" ] \
    || die "network $NET_NAME uses subnet $configured_subnet, expected $SUBNET"
else
  docker network create --internal --subnet "$SUBNET" \
    --label com.1brc.agents.network=internal-v1 "$NET_NAME" >/dev/null
fi

docker build -q -t 1brc-allowlist-proxy "$ROOT/harness/proxy" >/dev/null

docker volume inspect "$BRIDGE_VOLUME" >/dev/null 2>&1 \
  || docker volume create "$BRIDGE_VOLUME" >/dev/null

# The forwarder uses host networking only to reach the host-local service. It
# publishes that service through a Unix socket in a named volume, not a host
# TCP port; the allowlist proxy is the only container that consumes the socket.
docker run -d --name "$FORWARDER_NAME" --restart unless-stopped \
  --network host \
  -v "$BRIDGE_VOLUME:/bridge" \
  1brc-allowlist-proxy \
  node /opt/proxy/host-local-forward.js "$LOCAL_FORWARD_SOCKET" 127.0.0.1 "$LOCAL_FORWARD_TARGET_PORT" >/dev/null

docker run -d --name 1brc-proxy --restart unless-stopped \
  --network "$NET_NAME" --ip "$PROXY_IP" \
  --label com.1brc.agents.proxy=allowlist-v1 \
  -e ALLOW_DOMAINS="$ALLOW_DOMAINS" \
  -e PROXY_IDLE_TIMEOUT_MS="$PROXY_IDLE_TIMEOUT_MS" \
  -e LOCAL_FORWARD_PORT="$LOCAL_FORWARD_PORT" \
  -e LOCAL_FORWARD_TARGET_PORT="$LOCAL_FORWARD_TARGET_PORT" \
  -e LOCAL_FORWARD_SOCKET="$LOCAL_FORWARD_SOCKET" \
  -v "$BRIDGE_VOLUME:/bridge:ro" \
  1brc-allowlist-proxy >/dev/null

# proxy also joins the default bridge so it can reach the internet
docker network connect --gw-priority 1 bridge 1brc-proxy >/dev/null

proxy_running="$(docker inspect -f '{{.State.Running}}' 1brc-proxy)"
[ "$proxy_running" = true ] || die "proxy container is not running"
forwarder_running="$(docker inspect -f '{{.State.Running}}' "$FORWARDER_NAME")"
[ "$forwarder_running" = true ] || die "CLIProxyAPI forwarder is not running"
proxy_ip="$(docker inspect -f '{{(index .NetworkSettings.Networks "1brc-agent-net").IPAddress}}' 1brc-proxy)"
[ "$proxy_ip" = "$PROXY_IP" ] || die "proxy has IP $proxy_ip on $NET_NAME, expected $PROXY_IP"
proxy_networks="$(docker inspect -f '{{json .NetworkSettings.Networks}}' 1brc-proxy)"
case "$proxy_networks" in
  *'"bridge":'*) : ;;
  *) die "proxy is not attached to Docker's bridge network" ;;
esac

# Lock the sandbox subnet: established replies and the proxy are allowed;
# new traffic from sandbox IPs to any other destination is dropped.
install_firewall_rules "$PROXY_IP" "$SUBNET"

# On some hosts (notably nested Docker with bridge-nf enabled), same-bridge
# traffic to the proxy is filtered by DOCKER-USER before ICC completes.
# Disable bridge netfilter so L2 agent-net ↔ proxy stays reachable while the
# internal network + DROP rules still block non-proxy egress.
if [ -w /proc/sys/net/bridge/bridge-nf-call-iptables ]; then
  echo 0 > /proc/sys/net/bridge/bridge-nf-call-iptables || true
fi
if [ -w /proc/sys/net/bridge/bridge-nf-call-ip6tables ]; then
  echo 0 > /proc/sys/net/bridge/bridge-nf-call-ip6tables || true
fi

echo "OK: network $NET_NAME, proxy at 172.28.77.2:3128, subnet locked."
echo "Verify: docker run --rm --network $NET_NAME curlimages/curl:8.16.0 -sI -x http://$PROXY_IP:3128 https://api.openai.com"
echo "        (and expect 403 for anything not in ALLOW_DOMAINS)"
echo "Local API bridge: $PROXY_IP:$LOCAL_FORWARD_PORT -> host CLIProxyAPI 127.0.0.1:$LOCAL_FORWARD_TARGET_PORT"
