// Allowlisting CONNECT proxy — the only network door for the sandbox.
// Forwards HTTPS to an allowlist of model-API domains, denies and logs
// everything else. No MITM (raw pipe after CONNECT), so no certificate games.
const http = require("node:http");
const net = require("node:net");

const DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOSTNAME_RE = new RegExp(
  `^(?=.{1,253}$)${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*$`,
);

function envInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer in ${minimum}..${maximum}`);
  }
  return value;
}

const PORT = envInteger("PROXY_PORT", 3128, 1, 65535);
const CONNECT_TIMEOUT_MS = envInteger("PROXY_CONNECT_TIMEOUT_MS", 10000, 100, 300000);
// 0 disables idle timeouts. A 2-minute default previously killed live Cursor
// CONNECT tunnels while the model thought or ran local tools, which then
// surfaced to pi as errorMessage "terminated".
const IDLE_TIMEOUT_MS = envInteger("PROXY_IDLE_TIMEOUT_MS", 0, 0, 14400000);
const MAX_CONNECTIONS = envInteger("PROXY_MAX_CONNECTIONS", 256, 1, 10000);
// Optional fixed TCP bridge for a host-local model service. This is deliberately
// an exact host/port mapping; it is not a general CONNECT or port-forwarding
// facility. The benchmark uses it for the host's authenticated CLIProxyAPI.
const LOCAL_FORWARD_PORT = envInteger("LOCAL_FORWARD_PORT", 0, 0, 65535);
const LOCAL_FORWARD_TARGET_PORT = envInteger("LOCAL_FORWARD_TARGET_PORT", 0, 0, 65535);
const LOCAL_FORWARD_HOST = (process.env.LOCAL_FORWARD_HOST || "").trim();
const LOCAL_FORWARD_SOCKET = (process.env.LOCAL_FORWARD_SOCKET || "").trim();
if (
  LOCAL_FORWARD_PORT > 0 &&
  !LOCAL_FORWARD_SOCKET &&
  (!LOCAL_FORWARD_HOST || LOCAL_FORWARD_TARGET_PORT === 0)
) {
  throw new Error("LOCAL_FORWARD_SOCKET or LOCAL_FORWARD_HOST/LOCAL_FORWARD_TARGET_PORT is required when LOCAL_FORWARD_PORT is enabled");
}
const ALLOW = (process.env.ALLOW_DOMAINS || "")
  .split(",")
  .map((value) => normalizeHostname(value))
  .filter(Boolean);

function normalizeHostname(hostname) {
  if (typeof hostname !== "string") return "";
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!HOSTNAME_RE.test(normalized) || net.isIP(normalized)) return "";
  return normalized;
}

function allowed(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  return ALLOW.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

function parseConnectTarget(target) {
  if (typeof target !== "string" || target.length > 255) return null;
  const match = /^([^:]+):([0-9]{1,5})$/.exec(target);
  if (!match) return null;

  const hostname = normalizeHostname(match[1]);
  const port = Number(match[2]);
  if (!hostname || port !== 443) return null;
  return { hostname, port };
}

function log(entry) {
  entry.t = new Date().toISOString();
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function applyIdleTimeout(socket, onIdle) {
  if (IDLE_TIMEOUT_MS > 0) {
    socket.setTimeout(IDLE_TIMEOUT_MS, onIdle);
  } else {
    socket.setTimeout(0);
  }
}

function createProxyServer() {
  const server = http.createServer((req, res) => {
    // Plain HTTP is denied outright — HTTPS only via CONNECT.
    log({ type: "http", host: req.headers.host, allowed: false });
    res.writeHead(403).end("https only\n");
  });

  server.maxConnections = MAX_CONNECTIONS;
  if (IDLE_TIMEOUT_MS > 0) {
    server.requestTimeout = IDLE_TIMEOUT_MS;
    server.headersTimeout = IDLE_TIMEOUT_MS;
    server.keepAliveTimeout = IDLE_TIMEOUT_MS;
    server.on("connection", (socket) => {
      socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy());
    });
  } else {
    server.requestTimeout = 0;
    server.headersTimeout = 0;
  }

  server.on("clientError", (error, socket) => {
    log({ type: "error", err: String(error && error.code || error) });
    socket.destroy();
  });

  server.on("connect", (req, clientSocket, head) => {
    const target = req.url || "";
    const parsed = parseConnectTarget(target);
    const ok = Boolean(parsed && allowed(parsed.hostname));
    log({ type: "connect", host: target, allowed: ok });

    if (!ok) {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }

    let upstream;
    let closed = false;
    const closeBoth = (reason) => {
      if (closed) return;
      closed = true;
      if (reason) {
        log({ type: "error", host: target, err: reason });
      }
      clientSocket.destroy();
      if (upstream) upstream.destroy();
    };

    upstream = net.connect({ host: parsed.hostname, port: parsed.port });
    upstream.setTimeout(CONNECT_TIMEOUT_MS, () => closeBoth("upstream_timeout"));
    clientSocket.setTimeout(CONNECT_TIMEOUT_MS, () => closeBoth("client_timeout"));

    upstream.once("connect", () => {
      if (closed) return;
      applyIdleTimeout(upstream, () => closeBoth("upstream_idle_timeout"));
      applyIdleTimeout(clientSocket, () => closeBoth("client_idle_timeout"));
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });

    upstream.on("error", (error) => closeBoth(String(error && error.code || error)));
    clientSocket.on("error", (error) => closeBoth(String(error && error.code || error)));
    upstream.on("close", () => closeBoth());
    clientSocket.on("close", () => closeBoth());
  });

  return server;
}

function createLocalForwardServer() {
  const server = net.createServer((clientSocket) => {
    let upstream;
    let closed = false;
    const closeBoth = (reason) => {
      if (closed) return;
      closed = true;
      if (reason) {
        log({
          type: "local-forward-error",
          socket: LOCAL_FORWARD_SOCKET || undefined,
          host: LOCAL_FORWARD_SOCKET ? undefined : LOCAL_FORWARD_HOST,
          port: LOCAL_FORWARD_SOCKET ? undefined : LOCAL_FORWARD_TARGET_PORT,
          err: reason,
        });
      }
      clientSocket.destroy();
      if (upstream) upstream.destroy();
    };

    clientSocket.setTimeout(CONNECT_TIMEOUT_MS, () => closeBoth("client_timeout"));
    upstream = LOCAL_FORWARD_SOCKET
      ? net.createConnection(LOCAL_FORWARD_SOCKET)
      : net.connect({ host: LOCAL_FORWARD_HOST, port: LOCAL_FORWARD_TARGET_PORT });
    upstream.setTimeout(CONNECT_TIMEOUT_MS, () => closeBoth("upstream_timeout"));
    upstream.once("connect", () => {
      if (closed) return;
      applyIdleTimeout(upstream, () => closeBoth("upstream_idle_timeout"));
      applyIdleTimeout(clientSocket, () => closeBoth("client_idle_timeout"));
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", (error) => closeBoth(String(error && error.code || error)));
    clientSocket.on("error", (error) => closeBoth(String(error && error.code || error)));
    upstream.on("close", () => closeBoth());
    clientSocket.on("close", () => closeBoth());
  });

  server.maxConnections = MAX_CONNECTIONS;
  if (IDLE_TIMEOUT_MS > 0) {
    server.on("connection", (socket) => {
      socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy());
    });
  }
  return server;
}

if (require.main === module) {
  const server = createProxyServer();
  server.listen(PORT, () => log({
    type: "start",
    port: PORT,
    max_connections: MAX_CONNECTIONS,
    idle_timeout_ms: IDLE_TIMEOUT_MS,
    allow: ALLOW,
  }));

  if (LOCAL_FORWARD_PORT > 0) {
    const localForward = createLocalForwardServer();
    localForward.listen(LOCAL_FORWARD_PORT, () => log({
      type: "local_forward_start",
      port: LOCAL_FORWARD_PORT,
      target_socket: LOCAL_FORWARD_SOCKET || undefined,
      target_host: LOCAL_FORWARD_SOCKET ? undefined : LOCAL_FORWARD_HOST,
      target_port: LOCAL_FORWARD_SOCKET ? undefined : LOCAL_FORWARD_TARGET_PORT,
    }));
  }
}

module.exports = {
  allowed,
  normalizeHostname,
  parseConnectTarget,
  createProxyServer,
  createLocalForwardServer,
};
