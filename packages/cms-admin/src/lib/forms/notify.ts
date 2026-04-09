/**
 * F30 — Form submission notifications.
 *
 * Fire-and-forget: sends email + webhook after a form submission.
 * Also dispatches a `form.submitted` event through the F35 webhook system.
 */

import type { FormConfig } from "@webhouse/cms";
import type { FormSubmission } from "./types";

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

async function sendEmailNotification(form: FormConfig, sub: FormSubmission): Promise<void> {
  // Build a simple HTML email body from the submission data
  const fieldRows = Object.entries(sub.data)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:600;vertical-align:top">${escHtml(k)}</td><td style="padding:4px 0">${escHtml(String(v ?? ""))}</td></tr>`)
    .join("");

  const html = `
    <h2 style="margin:0 0 12px">New ${escHtml(form.label)} submission</h2>
    <table style="border-collapse:collapse;font-size:14px">${fieldRows}</table>
    <p style="margin:16px 0 0;font-size:12px;color:#888">Submitted ${sub.createdAt}</p>
  `;

  const subject = `[${form.label}] New submission`;
  const to = form.notifications!.email!;

  // Try Resend first (F29), fall back to console
  try {
    const { Resend } = await import("resend");
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not set");
    const resend = new Resend(key);
    const from = process.env.CMS_EMAIL_FROM || "forms@webhouse.app";
    await resend.emails.send({ from, to, subject, html });
  } catch {
    console.log(`[F30] Email notification (no email transport configured):`, { to, subject });
  }
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
  const html = `<div style="font-family:-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#333">${escHtml(textBody).replace(/\n/g, "<br>")}</div>`;
  const from = form.autoReply!.from || process.env.CMS_EMAIL_FROM || "forms@webhouse.app";

  try {
    const { Resend } = await import("resend");
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not set");
    const resend = new Resend(key);
    await resend.emails.send({ from, to: [to], subject, html });
  } catch {
    console.log(`[F30] Auto-reply (no email transport):`, { to, subject, textBody });
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
