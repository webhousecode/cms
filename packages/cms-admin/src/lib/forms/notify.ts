/**
 * F30 — Form submission notifications.
 *
 * Fire-and-forget: sends email + webhook after a form submission.
 * Also dispatches a `form.submitted` event through the F35 webhook system.
 */

import type { FormConfig } from "@webhouse/cms";
import type { FormSubmission } from "./types";
import { getMailer, buildFrom } from "../mailer";
import { readSiteConfig } from "../site-config";

/**
 * Send all configured notifications for a form submission.
 * Errors are caught and logged — never blocks the response.
 */
export async function notifyFormSubmission(
  form: FormConfig,
  submission: FormSubmission,
): Promise<void> {
  const promises: Promise<void>[] = [];

  // Email notification
  if (form.notifications?.email?.length) {
    promises.push(sendEmailNotification(form, submission).catch((e) => {
      console.error(`[F30] Email notification failed for form ${form.name}:`, e);
    }));
  }

  // Webhook forwarding (custom URL configured on the form)
  if (form.notifications?.webhook) {
    promises.push(forwardToWebhook(form.notifications.webhook, form, submission).catch((e) => {
      console.error(`[F30] Webhook forwarding failed for form ${form.name}:`, e);
    }));
  }

  // Auto-reply to submitter
  if (form.autoReply?.enabled && submission.data.email) {
    promises.push(sendAutoReply(form, submission).catch((e) => {
      console.error(`[F30] Auto-reply failed for form ${form.name}:`, e);
    }));
  }

  // F35 webhook event (goes through the site's configured webhook endpoints)
  promises.push(fireFormWebhookEvent(form, submission).catch((e) => {
    console.error(`[F30] Webhook event dispatch failed for form ${form.name}:`, e);
  }));

  await Promise.allSettled(promises);
}

/**
 * Resolve the (site-scoped) Resend key + sender identity. cms is
 * multi-tenant — there is no one global Resend key, so this reads the
 * ACTIVE site's config the same way lib/email.ts's sendEmail() does. Falls
 * back to RESEND_API_KEY/CMS_EMAIL_FROM for back-compat with any deploy
 * that still sets those directly.
 */
async function resolveMailer(overrideFrom?: string): Promise<{
  apiKey?: string;
  from: string;
  accentColor?: string;
  accentColor2?: string;
  footerName?: string;
}> {
  const siteConfig = await readSiteConfig().catch(() => null);
  const apiKey = siteConfig?.resendApiKey || process.env.RESEND_API_KEY;
  const fromEmail = overrideFrom || siteConfig?.emailFrom || process.env.CMS_EMAIL_FROM || "forms@webhouse.app";
  const fromName = siteConfig?.emailFromName || "webhouse.app";
  return {
    apiKey,
    from: buildFrom(fromName, fromEmail),
    accentColor: siteConfig?.emailAccentColor,
    accentColor2: siteConfig?.emailAccentColor2,
    footerName: siteConfig?.emailFooterName,
  };
}

/** Shared branded shell — dark card, gradient accent bar — matching
 *  lib/email.ts's renderInviteEmail so every cms-sent email looks the same
 *  shape. Colors + footer name are per-site (site-config emailAccentColor/
 *  emailAccentColor2/emailFooterName) so each brand keeps its own identity
 *  instead of every tenant's mail looking like webhouse.app's. The border +
 *  box-shadow glow is the accent color at low opacity — degrades gracefully
 *  in clients that strip box-shadow (Outlook), still reads fine as a plain
 *  bordered card there. */
function wrapBrandedEmail(opts: {
  title: string;
  bodyHtml: string;
  footerNote?: string;
  accentColor?: string;
  accentColor2?: string;
  footerName?: string;
}): string {
  const accent = opts.accentColor || "#F7BB2E";
  const accent2 = opts.accentColor2 || "#f59e0b";
  const footerName = opts.footerName || "webhouse.app";
  const glow = hexToRgba(accent, 0.35);
  const glowSoft = hexToRgba(accent, 0.15);
  const borderColor = hexToRgba(accent, 0.4);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#08090c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
    <div style="background:#12141a;border:1px solid ${borderColor};border-radius:16px;overflow:hidden;box-shadow:0 0 32px ${glow},0 0 64px ${glowSoft};">
      <div style="height:3px;background:linear-gradient(90deg,${accent},${accent2},${accent});"></div>
      <div style="padding:40px 36px;color:#e5e5e5;font-size:14px;line-height:1.6;">
        ${opts.bodyHtml}
      </div>
    </div>
    <div style="text-align:center;padding:24px 0 0;">
      ${opts.footerNote ? `<p style="margin:0 0 6px;font-size:11px;color:#525252;">${escHtml(opts.footerNote)}</p>` : ""}
      <p style="margin:0;font-size:10px;color:#333;">Sent by ${escHtml(footerName)}</p>
    </div>
  </div>
</body>
</html>`;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(247,187,46,${alpha})`;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

async function sendEmailNotification(form: FormConfig, sub: FormSubmission): Promise<void> {
  const fieldRows = Object.entries(sub.data)
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;font-weight:600;color:#a3a3a3;vertical-align:top;white-space:nowrap">${escHtml(k)}</td><td style="padding:6px 0;color:#fafafa">${escHtml(String(v ?? ""))}</td></tr>`)
    .join("");

  const bodyHtml = `
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#fafafa;">New ${escHtml(form.label)}</h1>
    <p style="margin:0 0 24px;font-size:12px;color:#737373;">Submitted ${escHtml(sub.createdAt)}</p>
    <table style="border-collapse:collapse;font-size:14px;width:100%">${fieldRows}</table>
  `;

  const subject = `[${form.label}] New submission`;
  const to = form.notifications!.email!;
  const { apiKey, from, accentColor, accentColor2, footerName } = await resolveMailer();
  const html = wrapBrandedEmail({ title: `New ${form.label} submission`, bodyHtml, accentColor, accentColor2, footerName });

  await getMailer(apiKey).send({ from, to, subject, html, text: Object.entries(sub.data).map(([k, v]) => `${k}: ${v}`).join("\n") });
}

async function forwardToWebhook(url: string, form: FormConfig, sub: FormSubmission): Promise<void> {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "form.submitted",
      form: form.name,
      formLabel: form.label,
      submission: sub,
    }),
  });
}

async function fireFormWebhookEvent(form: FormConfig, sub: FormSubmission): Promise<void> {
  try {
    const { fireContentEvent } = await import("../webhook-events");
    // Reuse content event with a "form.submitted" action — the webhook
    // system already knows how to dispatch to Discord/Slack/custom endpoints.
    await fireContentEvent(
      "form.submitted" as Parameters<typeof fireContentEvent>[0],
      form.name,
      sub.id,
      { data: { title: `${form.label}: new submission`, ...sub.data } } as Parameters<typeof fireContentEvent>[3],
      "form-engine",
    );
  } catch {
    // Webhook system not available — fine, this is optional
  }
}

/** Replace {{fieldName}} placeholders with submission data values. */
function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ""));
}

async function sendAutoReply(form: FormConfig, sub: FormSubmission): Promise<void> {
  const to = String(sub.data.email);
  if (!to || !to.includes("@")) return;

  const subject = interpolate(form.autoReply!.subject, sub.data);
  const textBody = interpolate(form.autoReply!.body, sub.data);
  const links = form.autoReply!.readMoreLinks ?? [];

  const { apiKey, from, accentColor, accentColor2, footerName } = await resolveMailer(form.autoReply!.from);
  const linkColor = accentColor || "#F7BB2E";

  const linksHtml = links.length
    ? `<div style="margin-top:28px;padding-top:24px;border-top:1px solid #262626;">
         <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#737373;text-transform:uppercase;letter-spacing:0.08em;">Læs også</p>
         ${links.map((l) => `<a href="${escHtml(l.url)}" style="display:block;margin:0 0 10px;font-size:14px;color:${linkColor};text-decoration:none;">${escHtml(l.label)} →</a>`).join("")}
       </div>`
    : "";

  const bodyHtml = `
    <div style="white-space:pre-line">${escHtml(textBody)}</div>
    ${linksHtml}
  `;
  const html = wrapBrandedEmail({ title: subject, bodyHtml, accentColor, accentColor2, footerName });

  const text = links.length
    ? `${textBody}\n\nLæs også:\n${links.map((l) => `${l.label}: ${l.url}`).join("\n")}`
    : textBody;

  await getMailer(apiKey).send({ from, to, subject, html, text });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
