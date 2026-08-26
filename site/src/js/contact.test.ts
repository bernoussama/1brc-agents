// Run: pnpm test  (or: node --experimental-strip-types src/js/contact.test.ts)
// The runnable check behind the contact form's trust boundary: schema accept/reject, the two spam
// gates, header-injection rejection, email-body escaping, and error repopulation. No framework, no
// fixtures.
import assert from "node:assert/strict";

import {
  buildEmail,
  contactSchema,
  escapeHtml,
  MIN_FILL_MS,
  repopulate,
  spamReason,
} from "./contact.ts";

const valid = {
  name: "Alex Chen",
  email: "player1@genesis.com",
  subject: "Tutorial inquiry",
  message: "I would love a devlog on dithering.",
  _ts: 1000,
};

// schema accepts a good submission and coerces the hidden timestamp from its string form
const ok = contactSchema.safeParse({ ...valid, _ts: "1000" });
assert.equal(ok.success, true);
assert.equal(ok.success && ok.data._ts, 1000);

// schema rejects a bad email and a too-short message
assert.equal(contactSchema.safeParse({ ...valid, email: "not-an-email" }).success, false);
assert.equal(contactSchema.safeParse({ ...valid, message: "too short" }).success, false);

// header-injection guard: a line break in name or subject is rejected, not stripped
assert.equal(contactSchema.safeParse({ ...valid, name: "Alex\r\nBcc: x@y.z" }).success, false);
assert.equal(contactSchema.safeParse({ ...valid, subject: "Hi\nBcc: x@y.z" }).success, false);

// spam gate — honeypot: any non-empty _gotcha rejects
assert.equal(spamReason({ _gotcha: "i-am-a-bot", _ts: 0 }, 10_000), "Message rejected.");

// spam gate — time: a submit faster than MIN_FILL_MS rejects; slower passes
const rendered = 10_000;
assert.ok(spamReason({ _ts: rendered }, rendered + MIN_FILL_MS - 1) !== null);
assert.equal(spamReason({ _ts: rendered }, rendered + MIN_FILL_MS), null);

// email body escapes HTML so a field can't inject markup, and the reply-to is the sender's address
const mail = buildEmail(
  { name: "<script>", email: "a@b.co", subject: "Hi & bye", message: "1 < 2" },
  "8-BitQuest",
);
assert.equal(mail.replyTo, "a@b.co");
assert.ok(mail.subject.startsWith("[8-BitQuest] Hi & bye — <script>")); // subject is a header, not HTML
assert.ok(mail.html.includes("&lt;script&gt;"));
assert.ok(mail.html.includes("1 &lt; 2"));
assert.ok(!mail.html.includes("<script>"));

// escapeHtml covers all five significant characters
assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");

// repopulate: a rejected submit gives every visible field back, so nothing typed is lost
const posted = new FormData();
posted.set("name", "Alex Chen");
posted.set("email", "not-an-email");
posted.set("subject", "Tutorial inquiry");
posted.set("message", "A long message worth preserving.");
posted.set("_gotcha", "");
posted.set("_ts", "1000");
assert.deepEqual(repopulate(posted), {
  name: "Alex Chen",
  email: "not-an-email",
  subject: "Tutorial inquiry",
  message: "A long message worth preserving.",
});

// ...and only those four. Echoing _gotcha back would defeat the honeypot on the retry, and a
// repopulated _ts would make the time gate reject every resubmission of a slowly-filled form.
assert.deepEqual(Object.keys(repopulate(posted)), ["name", "email", "subject", "message"]);

// a fresh GET render has no body, and a File entry never reaches a value attribute
assert.deepEqual(repopulate(null), { name: "", email: "", subject: "", message: "" });
const withFile = new FormData();
withFile.set("message", new File(["x"], "x.txt"));
assert.equal(repopulate(withFile).message, "");

console.log("contact: all assertions passed");
