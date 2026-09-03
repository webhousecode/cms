/**
 * F186 — the CMS's own letters, as PURE functions.
 *
 * De lå inde i send-vejen, og det er den fejl der lod den gamle skabelon stå i
 * månedsvis: **en mail ingen kan rendre er en mail ingen kigger på.** Filens
 * forgænger sagde det selv, og gjorde det så kun for den ene af de to.
 *
 * Her kan begge — og invitationen — rendres til en streng uden et CMS, en
 * konfiguration eller en udsendelse. Så kan de ses i en browser før de sendes,
 * og en test kan drive den ÆGTE funktion frem for en kopi af reglen.
 */
import type { FactRow } from "@broberg/mail-core";
import { bygMail, escapeHtml } from "./shell";
import type { MailBrand } from "./brand";

/** Formular-notifikation til sitets ejer. */
export function renderFormNotification(input: {
  formLabel: string;
  fakta: FactRow[];
  brand: MailBrand;
  lang: "da" | "en";
  etiket: string;
  modtaget: string;
  fodnote: string;
  svarTekst: string;
  svarHref?: string;
  aabnTekst: string;
  aabnHref?: string;
}): string {
  const { brand } = input;
  return bygMail(
    {
      emne: input.lang === "da" ? `Ny henvendelse: ${input.formLabel}` : `New enquiry: ${input.formLabel}`,
      preheader: input.fodnote,
      etiket: input.etiket,
      overskrift: input.formLabel,
      hilsen: input.modtaget,
      broedtekst: [],
      fakta: input.fakta,
      ...(input.svarHref ? { knap: { tekst: input.svarTekst, url: input.svarHref } } : {}),
      // "Åbn i CMS" er en ANDEN handling end "svar afsenderen", og skallen har
      // én knap. Den sekundære står som en linje: to lige store knapper gør
      // begge til et valg man skal træffe.
      ...(input.aabnHref
        ? {
            infoboksHtml:
              `<a href="${escapeHtml(input.aabnHref)}" style="color:${brand.accentColor};text-decoration:none;">`
              + `${escapeHtml(input.aabnTekst)} &rarr;</a>`,
          }
        : {}),
      fodlinjer: [input.fodnote],
      lang: input.lang,
    },
    brand,
  );
}

/** Auto-svar til den der skrev. Teksten er sitets egen — vi rører den ikke. */
export function renderAutoReply(input: {
  subject: string;
  body: string;
  links: Array<{ label: string; url: string }>;
  brand: MailBrand;
  laesOgsaa: string;
}): string {
  const { brand } = input;
  // Sitets tekst kommer som ét felt med linjeskift. Delt i afsnit så skallen
  // kan sætte dem, frem for at ryge ind som ét hvidrums-bevaret hak.
  const afsnit = input.body.split(/\n{2,}/).map((a) => a.trim()).filter(Boolean);
  const linksHtml = input.links.length
    ? `<p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">`
      + `${escapeHtml(input.laesOgsaa)}</p>`
      + input.links
          .map(
            (l) =>
              `<a href="${escapeHtml(l.url)}" style="display:block;margin:0 0 10px;font-size:14px;`
              + `color:${brand.accentColor};text-decoration:none;">${escapeHtml(l.label)} &rarr;</a>`,
          )
          .join("")
    : "";

  return bygMail(
    {
      emne: input.subject,
      preheader: afsnit[0]?.slice(0, 120) || input.subject,
      etiket: brand.navn,
      overskrift: input.subject,
      broedtekst: afsnit.length ? afsnit : [input.body],
      ...(linksHtml ? { infoboksHtml: linksHtml } : {}),
      fodlinjer: [brand.navn],
    },
    brand,
  );
}

/** Invitation til et site-team. */
export function renderInvite(input: {
  inviterName: string;
  siteName: string;
  role: string;
  inviteUrl: string;
  expiresInDays: number;
  brand: MailBrand;
}): string {
  const { brand } = input;
  return bygMail(
    {
      emne: `You've been invited to ${input.siteName}`,
      preheader: `${input.inviterName} has invited you to ${input.siteName}.`,
      etiket: "Invitation",
      overskrift: `You've been invited to ${input.siteName}`,
      fremhaevet: "invited",
      broedtekst: [
        `${input.inviterName} has invited you to join ${input.siteName} as ${input.role}.`,
        `This invitation expires in ${input.expiresInDays} days.`,
      ],
      knap: { tekst: "Accept invitation", url: input.inviteUrl },
      fodlinjer: [brand.navn],
      lang: "en",
    },
    brand,
  );
}
