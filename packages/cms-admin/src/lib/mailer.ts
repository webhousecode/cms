/**
 * cms mailer — the single delivery chokepoint, on @broberg/mail.
 *
 * Every email cms sends goes through `getMailer()`. The fleet package owns
 * DELIVERY only — cms keeps its own per-brand HTML templates. What we get for
 * free here: a dev/preview allowlist-gate (test sends never reach a real
 * customer — only the allowlist + fleet admins like cb@webhouse.dk), ship-dark
 * when no key is set (logged no-op instead of a crash), and a typed
 * { ok, id?, error?, skipped? } result that NEVER throws.
 *
 * cms is multi-tenant, so there is no one global Resend key: callers resolve
 * the key (per-tenant site/org config, or env) and the sender, and pass them in
 * — the key to `getMailer(key)`, the sender per message via `send({ from, … })`.
 */
import { createMailer, buildFrom, type Mailer } from "@broberg/mail";

/**
 * Build a mailer for a resolved Resend key.
 *
 * `live` (delivers to ALL recipients) is on only in production or when
 * MAIL_LIVE=1 — so a local/preview run never mails a real customer by accident
 * (in dev only the MAIL_ALLOWLIST + the always-allowed fleet admins receive).
 * Note we set `live` explicitly: the package would otherwise default it to
 * `!!apiKey`, which would make a dev box with a key go live.
 */
export function getMailer(apiKey?: string): Mailer {
  return createMailer({
    apiKey,
    live: process.env.NODE_ENV === "production" || process.env.MAIL_LIVE === "1",
    disabled: process.env.MAIL_DISABLED === "1",
    allowlist: (process.env.MAIL_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
}

export { buildFrom };
