// Bridge a Unix socket in a shared Docker volume to a host-local TCP service.
// This process runs with host networking, while the allowlist proxy consumes
// the socket from the locked agent network. It exposes no host TCP listener.
const fs = require("node:fs");
const net = require("node:net");

const socketPath = process.argv[2] || "/bridge/cliproxyapi.sock";
const targetHost = process.argv[3] || "127.0.0.1";
const targetPort = Number(process.argv[4] || 8317);

if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
  throw new Error("target port must be an integer in 1..65535");
}

try {
  fs.unlinkSync(socketPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const server = net.createServer((clientSocket) => {
  let upstream;
  let closed = false;
  const closeBoth = () => {
    if (closed) return;
    closed = true;
    clientSocket.destroy();
    if (upstream) upstream.destroy();
  };

  upstream = net.createConnection({ host: targetHost, port: targetPort });
  upstream.once("connect", () => {
    if (closed) return;
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", closeBoth);
  clientSocket.on("error", closeBoth);
  upstream.on("close", closeBoth);
  clientSocket.on("close", closeBoth);
});

server.listen(socketPath, () => {
  process.stdout.write(JSON.stringify({
    type: "host_local_forward_start",
    socket: socketPath,
    target_host: targetHost,
    target_port: targetPort,
  }) + "\n");
});

function shutdown() {
  server.close(() => {
    try {
      fs.unlinkSync(socketPath);
    } catch (error) {
      if (error.code !== "ENOENT") process.stderr.write(`${error}\n`);
    }
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
