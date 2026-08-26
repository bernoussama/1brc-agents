#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

process.env.ALLOW_DOMAINS = "api.openai.com,chatgpt.com";
const { allowed, parseConnectTarget } = require("../proxy/allowlist-proxy.js");

assert.equal(allowed("api.openai.com"), true);
assert.equal(allowed("v1.api.openai.com"), true);
assert.equal(allowed("API.OPENAI.COM."), true);
assert.equal(allowed("api.openai.com.evil.example"), false);
assert.equal(allowed("192.0.2.1"), false);
assert.equal(allowed("[::1]"), false);

assert.deepEqual(parseConnectTarget("api.openai.com:443"), {
  hostname: "api.openai.com",
  port: 443,
});
assert.equal(parseConnectTarget("api.openai.com:80"), null);
assert.equal(parseConnectTarget("api.openai.com"), null);
assert.equal(parseConnectTarget("192.0.2.1:443"), null);
assert.equal(parseConnectTarget("api.openai.com:443:extra"), null);

const proxyModule = path.resolve(__dirname, "../proxy/allowlist-proxy.js");
const idleZero = spawnSync(process.execPath, ["-e", `
  process.env.ALLOW_DOMAINS = "cursor.sh";
  process.env.PROXY_IDLE_TIMEOUT_MS = "0";
  const { allowed } = require(${JSON.stringify(proxyModule)});
  if (!allowed("api2.cursor.sh")) process.exit(2);
  if (!allowed("api3.cursor.sh")) process.exit(3);
`], { encoding: "utf8" });
assert.equal(idleZero.status, 0, idleZero.stderr || idleZero.stdout);

console.log("proxy tests: ok");
