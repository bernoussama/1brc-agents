/**
 * * The Resend send boundary for the contact action — extracted so its three outcomes (success /
 * provider error / network-or-timeout) are testable with an injected fetch. Framework-free: it never
 * throws and never logs, returning a discriminated {@link SendResult}. The action handler
 * (`src/actions/index.ts`) owns the Astro `ActionError` and the server-side logging of the detail.
 */
import type { ContactEmail } from "@js/contact";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** Cap a hung request; Resend is usually sub-second. */
export const SEND_TIMEOUT_MS = 10_000;

/** The account credentials + verified sender the send needs (read from env at request time). */
export interface ResendConfig {
  apiKey: string;
  to: string;
  from: string;
}

/**
 * The outcome, classified so the caller can react: `network` covers a thrown fetch (DNS failure,
 * connection reset, or the abort timeout firing); `provider` is a reached-but-rejected response
 * (its status + body kept for server-side logging, never shown to the visitor).
 */
export type SendResult =
  | { ok: true }
  | { ok: false; reason: "network"; detail: string }
  | { ok: false; reason: "provider"; status: number; detail: string };

/** Injectable seams — default to the platform fetch and the real timeout. */
export interface SendDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * * POST the built email to Resend and classify the outcome. Never throws.
 * @returns `{ ok: true }` on a 2xx, else a failure describing why (for logging + a generic reply).
 */
export async function sendContactEmail(
  email: ContactEmail,
  config: ResendConfig,
  { fetchImpl = fetch, timeoutMs = SEND_TIMEOUT_MS }: SendDeps = {},
): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: config.to,
        subject: email.subject,
        html: email.html,
        reply_to: email.replyTo,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // A thrown fetch: DNS/connection failure, or AbortSignal.timeout firing (a TimeoutError).
    return { ok: false, reason: "network", detail: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "provider", status: res.status, detail };
  }
  return { ok: true };
}
