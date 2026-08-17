// Allowlisting CONNECT proxy — the ONLY network door for the sandbox.
// Forwards HTTPS to an allowlist of model-API domains, denies and logs
// everything else. No MITM (raw pipe after CONNECT), so no cert games.
const http = require("http");
const net = require("net");

const PORT = parseInt(process.env.PROXY_PORT || "3128", 10);
const ALLOW = (process.env.ALLOW_DOMAINS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

function allowed(hostname) {
  if (!hostname || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false; // no IPs
  return ALLOW.some(d => hostname === d || hostname.endsWith("." + d));
}

function log(entry) {
  entry.t = new Date().toISOString();
  process.stdout.write(JSON.stringify(entry) + "\n");
}

const server = http.createServer((req, res) => {
  // Plain HTTP is denied outright — HTTPS only via CONNECT.
  log({ type: "http", host: req.headers.host, allowed: false });
  res.writeHead(403).end("https only\n");
});

server.on("connect", (req, clientSocket, head) => {
  const target = req.url || "";
  const hostname = target.split(":")[0];
  const port = parseInt(target.split(":")[1] || "443", 10);
  const ok = allowed(hostname);
  log({ type: "connect", host: target, allowed: ok });

  if (!ok) {
    clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    return clientSocket.destroy();
  }
  const upstream = net.connect(port, hostname, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  const fail = (err) => {
    log({ type: "error", host: target, err: String(err && err.code || err) });
    try { clientSocket.destroy(); upstream.destroy(); } catch {}
  };
  upstream.on("error", fail);
  clientSocket.on("error", fail);
});

server.listen(PORT, () => log({ type: "start", port: PORT, allow: ALLOW }));
