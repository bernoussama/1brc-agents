/**
 * * Astro Actions — the one server mutation in 8-BitQuest: the contact form.
 *
 * `accept: "form"` binds the action to a native `<form method="POST">`, so it works with JavaScript
 * disabled: the browser posts real FormData, Astro runs `contactSchema` first (the handler starts
 * from valid data), and `/contact/` re-renders with the result. Non-validation failures are thrown as
 * `ActionError`s whose message the page surfaces in one `role="alert"`; validation failures surface
 * per-field via `isInputError`. The Resend send itself lives in `@js/resend` (a tested, framework-free
 * boundary); here we translate its result — logging the provider detail server-side (it can name the
 * account, so it never reaches the visitor) and throwing a generic ActionError on any failure.
 */
import siteData from "@config/siteData.json";
import { buildEmail, contactSchema, spamReason } from "@js/contact";
import { sendContactEmail } from "@js/resend";
import { ActionError, defineAction } from "astro:actions";
// astro:env, not import.meta.env: on Cloudflare Workers secrets live only in the runtime env,
// which import.meta.env never sees. Declared (all optional) in astro.config.mjs `env.schema`.
import { CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL, RESEND_API_KEY } from "astro:env/server";

export const server = {
  contact: defineAction({
    accept: "form",
    input: contactSchema,
    handler: async (input) => {
      // 1. Spam gates (honeypot + time). Server clock — never the visitor's device.
      const reason = spamReason(input);
      if (reason) throw new ActionError({ code: "BAD_REQUEST", message: reason });

      // 2. Mail keys — checked at REQUEST time, so a missing key never breaks the build.
      const apiKey = RESEND_API_KEY;
      const to = CONTACT_TO_EMAIL;
      if (!apiKey || !to) {
        // The visitor gets the same generic message as any other send failure — naming the env vars
        // to the public tells an attacker what the deployment is missing and reads as a broken site.
        // The operator gets the actionable sentence in the Worker log, same split as the send failure
        // below.
        const missing = [!apiKey && "RESEND_API_KEY", !to && "CONTACT_TO_EMAIL"].filter(Boolean);
        console.error(
          `[contact] Not configured — set ${missing.join(" and ")} (see .env.example). ` +
            `On Cloudflare: pnpm wrangler secret put <NAME>.`,
        );
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Your message could not be sent. Please email me directly.",
        });
      }
      // Defaults to Resend's shared sender, which only delivers to the account owner's address.
      // Verify your own domain in Resend and set CONTACT_FROM_EMAIL to send anywhere.
      const from = CONTACT_FROM_EMAIL ?? "onboarding@resend.dev";

      // 3. Build (escaped) + send via the Resend boundary, then translate the result.
      const result = await sendContactEmail(buildEmail(input, siteData.name), { apiKey, to, from });
      if (!result.ok) {
        // Log the provider's real answer (it can name the account); never show it to the visitor.
        const context = result.reason === "provider" ? `provider ${result.status}` : result.reason;
        console.error(`[contact] Resend send failed (${context}):`, result.detail);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Your message could not be sent. Please email me directly.",
        });
      }

      return { ok: true as const };
    },
  }),
};
