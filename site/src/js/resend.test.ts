/**
 * Runnable self-check for the Resend send boundary in ./resend.ts — no test framework, no network.
 * A fake `fetchImpl` drives the three outcomes. Run: `pnpm test`, or directly
 * `node --experimental-strip-types src/js/resend.test.ts`.
 */
import assert from "node:assert/strict";

import type { ContactEmail } from "./contact.ts";
import { sendContactEmail } from "./resend.ts";

const email: ContactEmail = {
  subject: "[8-BitQuest] Hi — A",
  html: "<p>hi</p>",
  replyTo: "a@b.com",
};
const config = { apiKey: "re_test", to: "owner@site.com", from: "hello@site.com" };

// 1. Success: a 2xx resolves to { ok: true }, and the payload maps our fields onto Resend's shape.
{
  let sent: Record<string, unknown> = {};
  const fetchImpl: typeof fetch = async (_url, init) => {
    sent = JSON.parse(String(init?.body ?? "{}"));
    return new Response("{}", { status: 200 });
  };
  const result = await sendContactEmail(email, config, { fetchImpl });
  assert.equal(result.ok, true, "2xx is a success");
  assert.equal(sent.reply_to, "a@b.com", "the visitor's email becomes reply_to");
  assert.equal(sent.from, "hello@site.com", "from is the configured sender");
  assert.equal(sent.to, "owner@site.com", "to is the configured inbox");
}

// 2. Provider error: a non-2xx keeps the status + body for server-side logging, and never throws.
{
  const fetchImpl: typeof fetch = async () => new Response("domain not verified", { status: 403 });
  const result = await sendContactEmail(email, config, { fetchImpl });
  if (result.ok || result.reason !== "provider") assert.fail("403 must be a provider failure");
  assert.equal(result.status, 403);
  assert.equal(result.detail, "domain not verified", "the provider body is kept for logging");
}

// 3. Network / timeout: a thrown fetch (incl. the abort timeout) is a network failure, not a crash.
{
  const fetchImpl: typeof fetch = async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  };
  const result = await sendContactEmail(email, config, { fetchImpl });
  if (result.ok || result.reason !== "network")
    assert.fail("a thrown fetch must be a network failure");
  assert.match(result.detail, /timed out/, "the error message is carried for logging");
}

console.log("resend.test: ok");
