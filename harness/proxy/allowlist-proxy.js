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
const IDLE_TIMEOUT_MS = envInteger("PROXY_IDLE_TIMEOUT_MS", 120000, 1000, 3600000);
const MAX_CONNECTIONS = envInteger("PROXY_MAX_CONNECTIONS", 256, 1, 10000);
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

function createProxyServer() {
  const server = http.createServer((req, res) => {
    // Plain HTTP is denied outright — HTTPS only via CONNECT.
    log({ type: "http", host: req.headers.host, allowed: false });
    res.writeHead(403).end("https only\n");
  });

  server.maxConnections = MAX_CONNECTIONS;
  server.requestTimeout = IDLE_TIMEOUT_MS;
  server.headersTimeout = IDLE_TIMEOUT_MS;
  server.keepAliveTimeout = IDLE_TIMEOUT_MS;

  server.on("connection", (socket) => {
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy());
  });

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
      upstream.setTimeout(IDLE_TIMEOUT_MS, () => closeBoth("upstream_idle_timeout"));
      clientSocket.setTimeout(IDLE_TIMEOUT_MS, () => closeBoth("client_idle_timeout"));
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

if (require.main === module) {
  const server = createProxyServer();
  server.listen(PORT, () => log({
    type: "start",
    port: PORT,
    max_connections: MAX_CONNECTIONS,
    allow: ALLOW,
  }));
}

module.exports = { allowed, normalizeHostname, parseConnectTarget, createProxyServer };
