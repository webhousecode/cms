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
import { brandForSite } from "../mail/brand";
import { renderAutoReply, renderFormNotification } from "../mail/render";

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

  const subject = lang === "da" ? `Ny henvendelse: ${form.label}` : `New enquiry: ${form.label}`;
  const to = form.notifications!.email!;
  const { apiKey, from } = await resolveMailer();

  // F186 — husets skal, brandet fra DETTE sites config. Den håndskrevne tabel
  // der stod her var kopi to af et lag der allerede fandtes som pakke.
  const html = renderFormNotification({
    formLabel: form.label,
    fakta: Object.entries(sub.data)
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => ({ label: fieldLabel(form, k), value: String(v) })),
    brand: brandForSite(siteConfig),
    lang,
    etiket: t.heading(form.label),
    modtaget: `${t.received} ${humanTime(sub.createdAt, lang)}`,
    fodnote: t.footerNote(siteName),
    svarTekst: t.reply,
    ...(replyHref ? { svarHref: replyHref } : {}),
    aabnTekst: t.open,
    ...(openHref ? { aabnHref: openHref } : {}),
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

  const { apiKey, from } = await resolveMailer(form.autoReply!.from);
  const cfg = await readSiteConfig().catch(() => null);
  const html = renderAutoReply({
    subject,
    body: textBody,
    links,
    brand: brandForSite(cfg),
    laesOgsaa: "Læs også",
  });

  const text = links.length
    ? `${textBody}\n\nLæs også:\n${links.map((l) => `${l.label}: ${l.url}`).join("\n")}`
    : textBody;

  await getMailer(apiKey).send({ from, to, subject, html, text });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
