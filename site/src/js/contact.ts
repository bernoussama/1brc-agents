/**
 * * Contact form — the trust boundary.
 *
 * Pure and framework-free on purpose: no `import.meta.env`, no `fetch`, no Astro imports — so it
 * type-strips for `pnpm test` and the action handler (`src/actions/index.ts`) starts from data that
 * is already validated and, for the email, already escaped. One Zod schema is the ONLY definition of
 * a valid submission; the action re-runs it, never trusts the client.
 */
import { z } from "astro/zod";

/**
 * Reject CR/LF: `name` and `subject` are the two fields that reach a mail header (the subject line),
 * so a line break in either is a header-injection attempt. We reject rather than strip so the visitor
 * sees why.
 */
const noLineBreaks = (value: string): boolean => !/[\r\n]/.test(value);

/** The single source of truth for a valid submission. The two hidden fields feed the spam gates. */
export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name, player.")
    .max(100, "That name is too long.")
    .refine(noLineBreaks, "Line breaks are not allowed here."),
  email: z.string().trim().pipe(z.email("Please enter a valid email address.").max(254)),
  subject: z
    .string()
    .trim()
    .min(1, "Give your transmission a subject.")
    .max(150, "That subject is too long.")
    .refine(noLineBreaks, "Line breaks are not allowed here."),
  message: z
    .string()
    .trim()
    .min(10, "Tell me a little more than that.")
    .max(5000, "That transmission is too long."),
  /** Honeypot — permissive on purpose, so a filled value becomes a readable form-level rejection. */
  _gotcha: z.string().optional(),
  /** Render timestamp for the time gate; coerced from the hidden field's string. */
  _ts: z.coerce.number().int().positive(),
});

export type ContactInput = z.infer<typeof contactSchema>;

/** The fields the form echoes back after a rejected submit. Deliberately not the two hidden ones. */
export type RepopulatedField = "name" | "email" | "subject" | "message";

/**
 * * Pull the visitor's submitted values back out of a raw `FormData`, so a validation failure
 * re-renders the form filled in rather than blank.
 *
 * Needed because Astro's `isInputError(error)` exposes `.fields` — the messages — but never the input
 * that produced them. Without this a bad email address discards up to 5000 characters of message,
 * which is exactly the no-JS path the template advertises.
 *
 * The two hidden fields are excluded on purpose, not by omission: echoing `_gotcha` back would defeat
 * the honeypot on the retry, and `_ts` must carry the CURRENT render's timestamp or the time gate
 * rejects every resubmission of a form that was slow to fill.
 *
 * @param form the submitted FormData, or `null` on a fresh GET render
 * @returns every repopulated field as a string — `""` where absent or where the entry was a File
 */
export function repopulate(form: Pick<FormData, "get"> | null): Record<RepopulatedField, string> {
  // A multipart post can hand back a File for any name; it must never reach a value attribute.
  const read = (name: RepopulatedField): string => {
    const value = form?.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    name: read("name"),
    email: read("email"),
    subject: read("subject"),
    message: read("message"),
  };
}

/** Minimum ms between render and submit. Faster than a human can read the form ⇒ a bot. */
export const MIN_FILL_MS = 3000;

/**
 * * Spam gates, cheapest first: honeypot then time. Both judged server-clock to server-clock, never
 * the visitor's device. Returns a rejection reason, or `null` to proceed.
 *
 * The time gate has no upper bound (a form left open an hour still submits) and `_ts` is a forgeable
 * hidden field: this stops drive-by bots, not a targeted attacker. `ponytail:` ceiling — add
 * Cloudflare Turnstile (both keys or neither) if drive-by volume becomes a problem; it costs the
 * no-JS path, so it's deliberately left out here.
 *
 * @param fields the two hidden anti-spam fields
 * @param now    current epoch ms (injectable for the self-check)
 * @returns a reason string to reject, or `null` when the submission clears both gates
 */
export function spamReason(
  { _gotcha, _ts }: Pick<ContactInput, "_gotcha" | "_ts">,
  now: number = Date.now(),
): string | null {
  if (_gotcha) return "Message rejected.";
  if (now - _ts < MIN_FILL_MS) return "That was quick — please take another look and resend.";
  return null;
}

/** Escape the five HTML-significant characters so a field can't inject markup into the email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The Resend payload pieces built from validated fields — every value escaped, `replyTo` verbatim. */
export interface ContactEmail {
  subject: string;
  html: string;
  replyTo: string;
}

/**
 * * Build the email subject + HTML body from validated fields. Header-safe (`name`/`subject` carry no
 * line breaks, enforced by the schema) and body-safe (every interpolation is HTML-escaped).
 *
 * @param fields   the validated name/email/subject/message
 * @param siteName the brand, prefixed to the subject line (passed in to keep this module config-free)
 */
export function buildEmail(
  { name, email, subject, message }: Pick<ContactInput, "name" | "email" | "subject" | "message">,
  siteName: string,
): ContactEmail {
  return {
    subject: `[${siteName}] ${subject} — ${name}`,
    replyTo: email,
    html: [
      `<h2>New transmission from ${escapeHtml(name)}</h2>`,
      `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
      `<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>`,
      `<p><strong>Message:</strong></p>`,
      `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
    ].join("\n"),
  };
}
