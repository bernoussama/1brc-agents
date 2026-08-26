// Disable undici's default 300s bodyTimeout for every Node process in the
// agent container (pi, cursor-api-proxy, and the Cursor CLI). A Cursor
// completion can stay silent for many minutes while the model thinks or a
// local tool runs; the default then aborts the HTTP stream as "terminated".
//
// Node does not expose `node:undici` in this image, so load the copy bundled
// with pi (or npm as a fallback).
import { createRequire } from "node:module";
import fs from "node:fs";

const undiciParents = [
  "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/package.json",
  "/usr/local/lib/node_modules/npm/package.json",
];
const parent = undiciParents.find((file) => fs.existsSync(file));
if (!parent) {
  throw new Error("undici parent package not found; cannot disable fetch bodyTimeout");
}

const { Agent, setGlobalDispatcher } = createRequire(parent)("undici");
setGlobalDispatcher(
  new Agent({
    headersTimeout: 0,
    bodyTimeout: 0,
    connect: { timeout: 30_000 },
  }),
);
