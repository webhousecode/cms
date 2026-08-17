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
 * May this process deliver to ANY recipient, or only to the allowlist?
 *
 * The single definition of that question — `getMailer()` and the boot check in
 * instrumentation-node.ts must never be able to disagree about it.
 *
 * We answer it explicitly rather than letting @broberg/mail default `live` to
 * `!!apiKey`, which would make any dev box holding a Resend key mail real
 * customers. Two fleet repos hit that default before we did.
 *
 * The mirror risk is real too and is why this is exported: an environment where
 * NODE_ENV is not exactly "production" (unset, overwritten, a new base image)
 * silently drops prod to allowlist-only. No error, no warning — the package
 * only warns when `live` is left undefined, and we always pass a boolean.
 * assertMailGateSane() below is what turns that silence into a complaint.
 */
export function isMailLive(): boolean {
  return process.env.NODE_ENV === "production" || process.env.MAIL_LIVE === "1";
}

/**
 * What this process's delivery gate is set to, as one value with the reason in
 * it — mirroring @broberg/mail 0.5.0's `mailer.mode` so the two can be compared
 * directly once we upgrade.
 *
 * A boolean is the wrong shape here, which is the package author's point and it
 * applies to us too: MORE THAN ONE thing shuts the gate, and all of them return
 * the same success-shaped { ok: true, skipped: true }. A check written against
 * "is it live" passes happily over a mailer that is disabled outright.
 *
 * "no-key" is deliberately absent: cms is multi-tenant and resolves the Resend
 * key per site/org at send time, so key presence is not a boot-time property
 * here. That gap is real and only the package's own `mode` can close it.
 */
export type MailGateMode = "live" | "allowlist-only" | "disabled";

export function mailGateMode(): MailGateMode {
  if (process.env.MAIL_DISABLED === "1") return "disabled";
  return isMailLive() ? "live" : "allowlist-only";
}

/**
 * Shout if a DEPLOYED instance booted with the delivery gate shut.
 *
 * The signal for "this is a real deployment" must not be NODE_ENV, or the check
 * is circular — isMailLive() is true precisely when NODE_ENV is "production",
 * so a check gated on NODE_ENV could never fire. FLY_APP_NAME is injected by
 * the platform itself, not by our Dockerfile or fly.toml [env], so it survives
 * exactly the drift we are trying to catch.
 *
 * Deliberately does NOT throw: mail is one of many things cms-admin does, and
 * taking the whole admin down over a mail misconfiguration would trade a quiet
 * failure for a loud outage. Called once at boot.
 */
export function assertMailGateSane(log: (msg: string) => void = console.error): boolean {
  const isDeployed = !!process.env.FLY_APP_NAME;
  const mode = mailGateMode();
  if (!isDeployed || mode === "live") return true;
  const why =
    mode === "disabled"
      ? "MAIL_DISABLED=1 is set, so NOTHING is sent at all."
      : `NODE_ENV is "${process.env.NODE_ENV || "unset"}", not "production", ` +
        "so mail reaches only MAIL_ALLOWLIST + fleet admins. Set MAIL_LIVE=1 " +
        "to deliver anyway.";
  log(
    `[mailer] ${process.env.FLY_APP_NAME} BOOTED WITH DELIVERY GATED OFF ` +
      `(mode="${mode}") — sends will keep reporting success and nothing else ` +
      `will report this. ${why}`,
  );
  return false;
}

/**
 * Build a mailer for a resolved Resend key.
 *
 * `live` (delivers to ALL recipients) is on only in production or when
 * MAIL_LIVE=1 — so a local/preview run never mails a real customer by accident
 * (in dev only the MAIL_ALLOWLIST + the always-allowed fleet admins receive).
 */
export function getMailer(apiKey?: string): Mailer {
  return createMailer({
    apiKey,
    live: isMailLive(),
    disabled: process.env.MAIL_DISABLED === "1",
    allowlist: (process.env.MAIL_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
}

export { buildFrom };
