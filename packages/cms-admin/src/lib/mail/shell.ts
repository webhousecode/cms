/**
 * F186 — one shell for every mail cms-admin sends.
 *
 * HVORFOR PAKKEN OG IKKE VORES EGEN TABEL. `@broberg/mail-core` er husets
 * mail-skal, udgivet før vi begyndte. notify.ts og email.ts bar hver sin
 * håndskrevne <table> — altså kopi to og tre af det samme lag. vn-leker fandt
 * ud af at de havde bygget kopi nummer TRE uden at vide at pakken fandtes, og
 * reglen de kom ud med gælder her ordret:
 *
 *     SPØRG KATALOGEN OM KAPABILITETEN, ikke pakken om dens exports.
 *
 * FELTERNE TAGER STRUKTUR, IKKE HTML. `broedtekst` er en liste af strenge som
 * skallen pakker ind, og alt udefra escapes. Tog feltet rå HTML, ville den der
 * fylder det ud have to udfald og begge er dårlige: ren tekst mister format,
 * HTML kan knække layoutet eller injicere. `infoboksHtml` er den ene bevidste
 * undtagelse, og navnet siger det.
 */
import {
  renderShell, eyebrow, heading, paragraph, noteBox, factBox, cta, signOff, escapeHtml,
  SHELL_VERSION,
} from "@broberg/mail-core";
import type { FactRow } from "@broberg/mail-core";
import type { MailBrand } from "./brand";

// SHELL_VERSION er en STRENG, ikke et tal — `SHELL_VERSION < 2` ville have
// sammenlignet "2" med 2 gennem en tvungen konvertering og været sandt for
// "10" den dag skallen når dertil. Major-tallet læses eksplicit.
const SHELL_MAJOR = Number.parseInt(String(SHELL_VERSION), 10);
if (!Number.isFinite(SHELL_MAJOR) || SHELL_MAJOR < 2) {
  throw new Error(`@broberg/mail-core er for gammel (SHELL_VERSION ${SHELL_VERSION}, kræver major >= 2)`);
}

export interface MailFelter {
  emne: string;
  /** PÅKRÆVET — uden den viser indbakken de første ord af brødteksten som resumé. */
  preheader: string;
  /** Lille versal-etiket over overskriften, fx "Ny henvendelse". */
  etiket: string;
  overskrift: string;
  /** Ét ord i overskriften i accentfarven. Findes ordet ikke, står den uændret. */
  fremhaevet?: string;
  hilsen?: string;
  /** Afsnit som REN TEKST. Skallen escaper. */
  broedtekst: string[];
  /**
   * Etiket/værdi-rækker — det en formular-indsendelse ER. Skallens egen
   * factBox escaper, så feltnavne og svar fra en fremmed kan stå her råt.
   */
  fakta?: FactRow[];
  /** Rå HTML — den ene undtagelse. Escape selv alt dynamisk heri. */
  infoboksHtml?: string;
  knap?: { tekst: string; url: string };
  underskrift?: { afsked: string; navn: string; titel?: string };
  fodlinjer: string[];
  /** BCP-47. Sprog er data: et site kan køre dansk, engelsk eller begge. */
  lang?: string;
}

/** Byg en CMS-mail i et sites eget brand. */
export function bygMail(o: MailFelter, brand: MailBrand): string {
  if (!o.preheader) throw new Error("preheader er påkrævet — den er det indbakken viser før mailen åbnes");

  const dele = [
    eyebrow(o.etiket, { accentColor: brand.accentColor }),
    heading(o.overskrift, {
      ...(o.fremhaevet ? { emphasis: o.fremhaevet } : {}),
      accentColor: brand.accentColor,
      fontSerif: brand.fontSerif,
    }),
    o.hilsen ? paragraph(o.hilsen) : "",
    ...o.broedtekst.map((t) => paragraph(t)),
    o.fakta?.length ? factBox(o.fakta, { accentColor: brand.accentColor }) : "",
    o.infoboksHtml ? noteBox(o.infoboksHtml, { accentColor: brand.accentColor }) : "",
    o.knap ? cta(o.knap.url, o.knap.tekst, { accentColor: brand.accentColor }) : "",
    o.underskrift
      ? signOff([
          { text: o.underskrift.afsked },
          { text: o.underskrift.navn, tier: "name" as const },
          ...(o.underskrift.titel ? [{ text: o.underskrift.titel, tier: "meta" as const }] : []),
        ])
      : "",
  ];

  return renderShell({
    subject: o.emne,
    preheader: o.preheader,
    lang: o.lang || "da",
    bodyHtml: dele.filter(Boolean).join("\n"),
    accentColor: brand.accentColor,
    fontSerif: brand.fontSerif,
    fontSans: brand.fontSans,
    // SHIP-DARK: intet logo i config → mailen sendes uden mærke frem for med et
    // brækket billede.
    ...(brand.logoUrl ? { logoUrl: brand.logoUrl, logoAlt: brand.navn, logoWidth: brand.logoWidth } : {}),
    footerLines: o.fodlinjer,
    ...(brand.hjemmeside ? { footerHref: brand.hjemmeside, footerLabel: brand.hjemmesideLabel } : {}),
  });
}

export { escapeHtml };
