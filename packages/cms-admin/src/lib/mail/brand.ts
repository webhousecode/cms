/**
 * F186 — the brand a CMS mail is sent in.
 *
 * BRANDET ER ET ARGUMENT, IKKE EN KONSTANT. Mailen bærer AFSENDERENS identitet,
 * og cms-admin driver flere sites på én maskine: sanneandersen, webhouse-site,
 * broberg-ai. En hardkodet farve eller et hardkodet mærke her ville sende
 * broberg.ai's blå ud på Sannes klienters mails.
 *
 * Trækket er vn-lekers (webhousecode/vnlekerv2, src/mail/webhouse-mail.mjs),
 * hvor Christian rettede præcis den fejl på deres første udgave. Vi kopierer
 * mønstret, ikke filen — deres brand-liste er deres.
 *
 * Værdierne kommer fra SITE-CONFIG, som allerede bar dem. De var der hele
 * tiden; den gamle skabelon brugte kun to af dem og havde slet ikke et
 * logo-felt.
 */
import type { SiteConfig } from "@/lib/site-config";

export interface MailBrand {
  navn: string;
  accentColor: string;
  /** Absolut URL. En relativ sti er usynlig i en mailklient. */
  logoUrl?: string;
  /** UDEN dette tegner Outlook mærket i fuld filstørrelse (vn-lekers måling). */
  logoWidth: number;
  hjemmeside?: string;
  hjemmesideLabel?: string;
  fontSerif: string;
  fontSans: string;
}

/** Faldback-STAK, ikke ét navn: Apple Mail viser den første, Outlook falder ned. */
const FONT_SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',Times,serif";
const FONT_SANS = "'DM Sans',Arial,Helvetica,sans-serif";

/**
 * Sidste udvej, brugt når site-config intet siger. IKKE et brand vi foretrækker
 * — et brand der ikke lyver: husets eget navn og mærke frem for et tilfældigt
 * andet sites farve.
 */
export const WEBHOUSE: MailBrand = {
  navn: "WebHouse ApS",
  accentColor: "#e4203a",
  logoUrl: "https://www.webhouse.dk/assets/mail/webhouse-maerke.png",
  logoWidth: 56,
  hjemmeside: "https://webhouse.dk",
  hjemmesideLabel: "webhouse.dk",
  fontSerif: FONT_SERIF,
  fontSans: FONT_SANS,
};

/** Et gyldigt CSS-hex. En ugyldig farve fra config må ikke nå skallen. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Byg brandet for det site denne mail sendes for.
 *
 * SHIP-DARK PÅ LOGOET, og det er ikke en detalje: mangler et logo i config,
 * sendes mailen UDEN mærke frem for med et brækket billede. Et hul hvor logoet
 * skulle stå er det eneste der er værre end intet logo — det ligner en mail
 * der ikke kom helt frem.
 */
export function brandForSite(config: Partial<SiteConfig> | null | undefined): MailBrand {
  const c = (config ?? {}) as Record<string, unknown>;

  const accent = str(c.emailAccentColor) && HEX.test(str(c.emailAccentColor)!)
    ? str(c.emailAccentColor)!
    : WEBHOUSE.accentColor;

  const navn = str(c.emailFooterName) ?? str(c.emailFromName) ?? WEBHOUSE.navn;

  // Kun absolutte adresser. En mailklient har ingen side at være relativ TIL.
  const logo = abs(c.emailLogoUrl);
  const site = abs(c.deployProductionUrl) ?? abs(c.previewSiteUrl);

  return {
    navn,
    accentColor: accent,
    ...(logo ? { logoUrl: logo } : {}),
    logoWidth: 56,
    ...(site ? { hjemmeside: site, hjemmesideLabel: site.replace(/^https?:\/\//i, "") } : {}),
    fontSerif: FONT_SERIF,
    fontSans: FONT_SANS,
  };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function abs(v: unknown): string | undefined {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s.replace(/\/$/, "") : undefined;
}
