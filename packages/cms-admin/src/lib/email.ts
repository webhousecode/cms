import { getMailer, buildFrom, explainSkippedSend } from "./mailer";
import { readSiteConfig } from "./site-config";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ ok: boolean; error?: string }> {
  const config = await readSiteConfig();
  const apiKey = config.resendApiKey || process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Resend API key not configured. Go to Settings → Email." };
  }
  const fromEmail = config.emailFrom || "noreply@webhouse.app";
  const fromName = config.emailFromName || "webhouse.app";

  const mailer = getMailer(apiKey);
  const r = await mailer.send({
    from: buildFrom(fromName, fromEmail),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  // A SKIPPED send is `{ ok: true, skipped: true }` — success-shaped, and it
  // used to be reported as a sent mail. It is not one: nothing left the
  // building. Callers get a false here so they cannot tell anyone otherwise.
  if (r.skipped) return { ok: false, error: explainSkippedSend(mailer.mode, opts.to) };
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/**
 * Invite email — sent when an admin invites someone to a site team.
 */
/**
 * Invite email — sent when an admin invites someone to a site team.
 *
 * F186: rendres nu gennem husets skal (@broberg/mail-core) i SITETS brand, i
 * stedet for den håndskrevne HTML der stod her. Teksten er uændret.
 */
export async function renderInviteEmail(opts: {
  inviterName: string;
  siteName: string;
  role: string;
  inviteUrl: string;
  expiresInDays: number;
}): Promise<{ subject: string; html: string }> {
  const config = await readSiteConfig().catch(() => null);
  const { brandForSite } = await import("./mail/brand");
  const { renderInvite } = await import("./mail/render");
  return {
    subject: `You've been invited to ${opts.siteName}`,
    html: renderInvite({ ...opts, brand: brandForSite(config) }),
  };
}
