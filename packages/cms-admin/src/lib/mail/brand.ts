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
  /**
   * Accentfarven gjort LÆSBAR som tekst — mørknet indtil den klarer
   * WCAG AA (4,5:1). Brug den hvor farven ER tekst (etiket, links); brug
   * accentColor hvor den er en FLADE (knap-baggrund, kantlinje).
   *
   * Målt 5/9-2026 på WebHouse-guld #F7BB2E: etiketten «Ny henvendelse», linket
   * «Åbn i CMS» og fodnotens sitenavn stod alle på 1,73:1 og 1,58:1 — under den
   * halve af kravet. Standardfarven (#e4203a) klarede den, så fejlen var
   * usynlig indtil et site med et lyst brand fik sin første mail.
   */
  accentText: string;
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
  // Udledt, ikke skrevet af: husets egen røde måler 4,54:1 mod hvid og 4,35:1
  // mod fodnotens grå. En hardkodet kopi ville se rigtig ud og være forkert.
  get accentText() { return laesbarSomTekst("#e4203a"); },
  logoUrl: "https://www.webhouse.dk/assets/mail/webhouse-maerke.png",
  logoWidth: 56,
  hjemmeside: "https://webhouse.dk",
  hjemmesideLabel: "webhouse.dk",
  fontSerif: FONT_SERIF,
  fontSans: FONT_SANS,
};

/** WCAG relativ luminans for en sRGB-kanal. */
function kanal(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Kontrast mod mailens LYSESTE flade. Ikke hvid: skallens fodnote står på
 * #f4f4f5, og et mål på hvid gav 4,18:1 dér — grønt i regnestykket, rødt på
 * skærmen. Målt med Lens' kontrast-kritiker 5/9-2026.
 */
const LYSESTE_FLADE = 0.2126 * kanal(0xf4) + 0.7152 * kanal(0xf4) + 0.0722 * kanal(0xf5);

function kontrastModFlade(r: number, g: number, b: number): number {
  const L = 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
  return (LYSESTE_FLADE + 0.05) / (L + 0.05);
}

function hexTilRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const fuld = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(fuld.slice(0, 2), 16), parseInt(fuld.slice(2, 4), 16), parseInt(fuld.slice(4, 6), 16)];
}

/**
 * Mørkner en accentfarve indtil den er læsbar som TEKST (WCAG AA, 4,5:1) på
 * mailens lyseste flade,
 * med kuløren i behold. Klarer farven det allerede, returneres den uændret — så
 * et brand med en mørk accent ser præcis ud som før.
 */
export function laesbarSomTekst(hex: string): string {
  if (!HEX.test(hex)) return hex;
  let [r, g, b] = hexTilRgb(hex);
  // 40 skridt à 2,5 % er rigeligt til at nå fra den lyseste tænkelige accent
  // ned under kravet, og stopper straks farven er god nok.
  for (let i = 0; i < 40 && kontrastModFlade(r, g, b) < 4.5; i++) {
    r = Math.round(r * 0.95);
    g = Math.round(g * 0.95);
    b = Math.round(b * 0.95);
  }
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

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
    accentText: laesbarSomTekst(accent),
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
