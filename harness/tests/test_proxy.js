#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

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

console.log("proxy tests: ok");
