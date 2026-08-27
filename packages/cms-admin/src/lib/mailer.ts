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
import { createMailer, buildFrom, type Mailer, type DeliveryMode } from "@broberg/mail";

/**
 * May this process deliver to ANY recipient, or only to the allowlist?
 *
 * The single definition of that question — `getMailer()` and the boot check in
 * instrumentation-node.ts must never be able to disagree about it.
 *
 * We answer it explicitly. Up to @broberg/mail 0.2.x this was load-bearing on
 * its own: `live` defaulted to `!!apiKey`, so any dev box holding a Resend key
 * mailed real customers, and two fleet repos hit that before we did. 0.3.0
 * changed the default to `false`, so the package now fails safe too — but the
 * explicit answer stays, because it is what makes MAIL_LIVE=1 mean something
 * and what the boot check below reads.
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
 * it. Same shape as @broberg/mail's own `mailer.mode` (0.5.0, added at cms's
 * request), and mailer-mode-parity.test.ts pins the two together so they cannot
 * drift apart in silence.
 *
 * A boolean is the wrong shape here, which is the package author's point and it
 * applies to us too: MORE THAN ONE thing shuts the gate, and all of them return
 * the same success-shaped { ok: true, skipped: true }. A check written against
 * "is it live" passes happily over a mailer that is disabled outright.
 *
 * "no-key" is deliberately absent, and stays absent now that the package can
 * report it: cms is multi-tenant and resolves the Resend key per site/org at
 * SEND time, so key presence is not a boot-time property here at all. Asking
 * this function about it would produce a boot complaint on every healthy start.
 * The key question is answered where the key exists — see explainSkippedSend().
 */
export type MailGateMode = Exclude<DeliveryMode, "no-key">;

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

/**
 * Why a send that reported success delivered nothing — in words an admin can act on.
 *
 * @broberg/mail returns the SAME success-shaped `{ ok: true, skipped: true }`
 * for four unrelated situations, and cms threw that distinction away: lib/email.ts
 * read `r.ok` alone, so `POST /api/admin/invitations` answered `emailSent: true`
 * for a mail that was never sent. An admin invited a customer, was told the
 * invitation had gone out, and nothing had.
 *
 * `mailer.mode` is what makes the message actionable rather than merely honest —
 * "not sent" is not something an admin can fix; "MAIL_DISABLED=1 is set" is. It
 * is read from the mailer that actually ran, never re-derived here, so it cannot
 * describe a different mailer than the one that skipped.
 */
export function explainSkippedSend(mode: DeliveryMode, to: string): string {
  switch (mode) {
    case "no-key":
      return "Ingen Resend-nøgle er sat op for dette site, så mailen blev ikke sendt. Sæt den under Indstillinger → Email.";
    case "disabled":
      return "Mailudsendelse er slået helt fra på denne server (MAIL_DISABLED=1), så mailen blev ikke sendt.";
    case "allowlist-only":
      return `Dette miljø sender kun til godkendte adresser, og ${to} er ikke blandt dem — mailen blev ikke sendt. Sæt MAIL_LIVE=1 for at sende rigtigt herfra.`;
    case "live":
      // Should not happen: a live mailer skips nothing. Say so rather than
      // inventing a reason — a wrong explanation is worse than an odd one.
      return "Mailen blev ikke sendt, og afsenderen kunne ikke oplyse hvorfor. Tjek serverloggen.";
  }
}

export { buildFrom };
