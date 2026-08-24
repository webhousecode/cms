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

/**
 * The shell every form notification is sent in.
 *
 * REPLACES a dark card with a gold glow. Christian, seeing one in Gmail:
 * "frygteligt design". Three things were wrong with it, and only one was taste:
 *
 *  - It painted a black slab into a white inbox. An email does not get to
 *    decide what the surrounding client looks like, so a dark design reads as a
 *    hole in the page rather than as a brand.
 *  - It was decorative where it needed to be useful. A notification exists to be
 *    ACTED on, and this one carried no way to reply and no way to open the
 *    submission.
 *  - It printed the machine's own words at a human: raw field keys ("name",
 *    "message") and an ISO timestamp, while the form config had proper labels
 *    sitting right there unused.
 *
 * Light, quiet, and built out of table cells so Outlook renders it the same as
 * everyone else. The accent survives as one thin rule — enough to be ours,
 * not enough to be the subject.
 */
export function wrapBrandedEmail(opts: {
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
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e6eb;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="height:4px;background:linear-gradient(90deg,${accent},${accent2});font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 28px;color:#1f2328;font-size:15px;line-height:1.55;">
          ${opts.bodyHtml}
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr><td align="center" style="padding:16px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          ${opts.footerNote
            ? `<p style="margin:0;font-size:12px;color:#8a8f98;">${escHtml(opts.footerNote)}</p>`
            : `<p style="margin:0;font-size:11px;color:#a4a9b3;">${escHtml(footerName)}</p>`}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** A field's human label, from the form config. Falls back to a prettified key
 *  so a field added outside the config still reads as words, not as a variable
 *  name — which is exactly what the old template shipped. */
function fieldLabel(form: FormConfig, key: string): string {
  const field = form.fields?.find((f) => f.name === key);
  if (field?.label) return field.label;
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** A timestamp a person can read, in the site's own language and timezone.
 *  The old template printed the stored ISO string verbatim. */
function humanTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Europe/Copenhagen",
    }).format(d);
  } catch {
    return iso;
  }
}

const COPY = {
  da: {
    // Deliberately NOT built from form.label. That label is whatever the site
    // author typed — on webhouse it is the English word "Contact", and forcing
    // it lowercase produced "Ny henvendelse via contact". Which form it was is
    // already in the footer line and in the subject; the heading only has to
    // say what happened.
    heading: (_label: string) => `Ny henvendelse`,
    received: "Modtaget",
    reply: "Svar til afsenderen",
    open: "Åbn i CMS",
    replySubject: "Sv:",
    footerNote: (site: string) => `Sendt fra kontaktformularen på ${site}`,
  },
  en: {
    heading: (_label: string) => `New enquiry`,
    received: "Received",
    reply: "Reply to sender",
    open: "Open in the CMS",
    replySubject: "Re:",
    footerNote: (site: string) => `Sent from the contact form on ${site}`,
  },
} as const;

/**
 * The notification's body, as a pure function.
 *
 * Pulled out of the send path on purpose: an email nobody can render is an
 * email nobody checks, and this template shipped for months looking like
 * something none of us would have approved if we had looked at it once.
 * Now it can be rendered to a file, screenshotted, and unit-tested.
 */
export function renderFormNotificationBody(input: {
  form: FormConfig;
  sub: FormSubmission;
  lang: "da" | "en";
  accent: string;
  replyHref: string;
  openHref: string;
}): string {
  const { form, sub, lang, accent, replyHref, openHref } = input;
  const t = COPY[lang];

  const fieldRows = Object.entries(sub.data)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => {
      const value = String(v);
      const isEmail = value.includes("@") && !value.includes(" ");
      const shown = isEmail
        ? `<a href="mailto:${escHtml(value)}" style="color:#1f6feb;text-decoration:none;">${escHtml(value)}</a>`
        : escHtml(value).replace(/\n/g, "<br />");
      return `<tr>
        <td style="padding:10px 16px 10px 0;color:#6a707c;font-size:13px;vertical-align:top;white-space:nowrap;border-top:1px solid #eef0f3;">${escHtml(fieldLabel(form, k))}</td>
        <td style="padding:10px 0;color:#1f2328;font-size:15px;vertical-align:top;border-top:1px solid #eef0f3;">${shown}</td>
      </tr>`;
    })
    .join("");

  const buttons = [
    replyHref
      ? `<a href="${escHtml(replyHref)}" style="display:inline-block;padding:11px 20px;background:${escHtml(accent)};color:#1f2328;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${t.reply}</a>`
      : "",
    openHref
      ? `<a href="${escHtml(openHref)}" style="display:inline-block;padding:11px 20px;margin-left:8px;background:#ffffff;color:#1f2328;font-size:14px;font-weight:600;text-decoration:none;border:1px solid #d6d9df;border-radius:8px;">${t.open}</a>`
      : "",
  ].filter(Boolean).join("");

  return `
    <h1 style="margin:0 0 6px;font-size:19px;font-weight:600;color:#1f2328;line-height:1.35;">${escHtml(t.heading(form.label))}</h1>
    <p style="margin:0 0 22px;font-size:13px;color:#8a8f98;">${escHtml(t.received)} ${escHtml(humanTime(sub.createdAt, lang))}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${fieldRows}</table>
    ${buttons ? `<div style="margin-top:26px;">${buttons}</div>` : ""}
  `;
}

async function sendEmailNotification(form: FormConfig, sub: FormSubmission): Promise<void> {
  const siteConfig = await readSiteConfig().catch(() => null);
  const lang: "da" | "en" = siteConfig?.defaultLocale === "da" ? "da" : "en";
  const t = COPY[lang];
  const siteName = siteConfig?.emailFooterName || siteConfig?.emailFromName || "webhouse.app";
  const accent = siteConfig?.emailAccentColor || "#F7BB2E";

  const senderEmail = typeof sub.data.email === "string" ? sub.data.email : "";
  const replyHref = senderEmail
    ? `mailto:${senderEmail}?subject=${encodeURIComponent(`${t.replySubject} ${form.label}`)}`
    : "";

  // Cross-workspace deep link (house rule): a raw /admin URL would drop the
  // recipient into whichever site their browser last had open.
  let openHref = "";
  try {
    const { buildAdminDeepLink } = await import("../goto-links");
    const { getActiveSiteEntry } = await import("../site-paths");
    const { cookies } = await import("next/headers");
    const site = await getActiveSiteEntry().catch(() => null);
    const orgId = await cookies().then((c) => c.get("cms-active-org")?.value ?? null).catch(() => null);
    openHref = await buildAdminDeepLink({
      base: process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`,
      path: `/admin/forms/${encodeURIComponent(form.name)}`,
      orgId,
      siteId: site?.id ?? null,
      label: `form.submitted → ${form.label}`,
    });
  } catch {
    // No link is better than a link into the wrong workspace.
  }

  const bodyHtml = renderFormNotificationBody({ form, sub, lang, accent, replyHref, openHref });
  const subject = lang === "da" ? `Ny henvendelse: ${form.label}` : `New enquiry: ${form.label}`;
  const to = form.notifications!.email!;
  const { apiKey, from, accentColor, accentColor2, footerName } = await resolveMailer();
  const html = wrapBrandedEmail({
    title: subject,
    bodyHtml,
    footerNote: t.footerNote(siteName),
    accentColor,
    accentColor2,
    footerName,
  });

  const text = [
    t.heading(form.label),
    `${t.received} ${humanTime(sub.createdAt, lang)}`,
    "",
    ...Object.entries(sub.data)
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => `${fieldLabel(form, k)}: ${v}`),
  ].join("\n");

  await getMailer(apiKey).send({ from, to, subject, html, text });
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
