import { Resend } from "resend";
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

  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to send email" };
  }
}

/**
 * Invite email — sent when an admin invites someone to a site team.
 */
export function renderInviteEmail(opts: {
  inviterName: string;
  siteName: string;
  role: string;
  inviteUrl: string;
  expiresInDays: number;
}): { subject: string; html: string } {
  const { inviterName, siteName, role, inviteUrl, expiresInDays } = opts;

  const subject = `You've been invited to ${siteName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px;">

    <!-- Card -->
    <div style="background:#141414;border:1px solid #262626;border-radius:16px;overflow:hidden;">

      <!-- Gold accent bar -->
      <div style="height:3px;background:linear-gradient(90deg,#F7BB2E,#f59e0b,#F7BB2E);"></div>

      <!-- Content -->
      <div style="padding:40px 36px;">

        <!-- Logo -->
        <div style="text-align:center;margin-bottom:32px;">
          <img src="https://webhouse.app/webhouse.app-dark-icon.svg" alt="" width="48" height="48" style="display:inline-block;" />
        </div>

        <!-- Heading -->
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fafafa;text-align:center;">
          You're invited
        </h1>
        <p style="margin:0 0 28px;font-size:14px;color:#737373;text-align:center;line-height:1.5;">
          <strong style="color:#a3a3a3;">${inviterName}</strong> has invited you to join
        </p>

        <!-- Site name badge -->
        <div style="text-align:center;margin-bottom:28px;">
          <span style="display:inline-block;padding:8px 20px;border-radius:8px;background:#1a1a1a;border:1px solid #333;font-size:16px;font-weight:700;letter-spacing:0.01em;">${
            siteName.includes(".")
              ? `<span style="color:#fafafa;">${siteName.slice(0, siteName.lastIndexOf("."))}</span><span style="color:#F7BB2E;">${siteName.slice(siteName.lastIndexOf("."))}</span>`
              : `<span style="color:#fafafa;">${siteName}</span>`
          }</span>
        </div>

        <!-- Role pill -->
        <div style="text-align:center;margin-bottom:32px;">
          <span style="display:inline-block;padding:4px 14px;border-radius:999px;background:rgba(247,187,46,0.12);font-size:11px;font-weight:700;color:#F7BB2E;text-transform:uppercase;letter-spacing:0.08em;">
            ${role}
          </span>
        </div>

        <!-- CTA Button -->
        <div style="text-align:center;margin-bottom:28px;">
          <a href="${inviteUrl}" style="display:inline-block;padding:12px 36px;border-radius:8px;background:#F7BB2E;color:#0d0d0d;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.01em;">
            Accept invitation
          </a>
        </div>

        <!-- Expiry note -->
        <p style="margin:0;font-size:12px;color:#525252;text-align:center;line-height:1.5;">
          This invitation expires in ${expiresInDays} days.
        </p>

      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:24px 0 0;">
      <p style="margin:0 0 6px;font-size:11px;color:#404040;">
        Sent by
        <a href="https://webhouse.app" style="text-decoration:none;"><strong style="color:#fafafa;">webhouse</strong><strong style="color:#F7BB2E;">.app</strong></a>
      </p>
      <p style="margin:0;font-size:10px;color:#333;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </div>

  </div>
</body>
</html>`;

  return { subject, html };
}
