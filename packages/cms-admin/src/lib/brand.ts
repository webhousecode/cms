/**
 * F210 — white-label. The brand (name, logo, colour) is chosen by the ADDRESS
 * the CMS is opened on: cms.fysio.work shows fysio.work, webhouse.app and any
 * unknown address show webhouse. One server, one codebase — only the skin moves.
 *
 * Brand packs live in BRAND_PACKS below, one entry per customer, logo files in
 * public/brands/<id>/. A new customer is a commit, not a runtime setting: the
 * set is small, reviewed, and needs no storage, cache or SSH to change.
 */

export interface BrandPack {
  id: string;
  /** What the product is called on this brand's address. */
  name: string;
  /** Exact hostnames that select this brand. */
  hosts: string[];
  logo: { light: string; dark: string };
  favicon: string;
  /** Main brand colour (hex), used on light themes. */
  color: string;
  /** Text colour on `color`. */
  colorForeground: string;
  /** Optional variant for dark themes. */
  colorDark?: string;
  /** Text colour on `colorDark`; computed for contrast when absent. */
  colorDarkForeground?: string;
  /** F211 — admin language for a user who has not chosen one (e.g. "da"). */
  defaultLocale?: string;
  /** F210.7 — the UI typeface: its family name and a SELF-HOSTED stylesheet
   *  under /brands/<id>/ with the @font-face rules (never a third-party URL —
   *  that would send every visitor's address to the font host). */
  font?: { family: string; stylesheet: string };
  /** F210.5 — this brand's own BID client, as the NAMES of the env vars that
   *  hold it (never the values). BID designs its login dialog per client, so
   *  each brand gets one. Unset env → the default client (ship dark). */
  bidClient?: { idEnv: string; secretEnv: string };
}

export const DEFAULT_BRAND: BrandPack = {
  id: "webhouse",
  name: "webhouse.app",
  hosts: [],
  logo: { light: "/webhouse-wordmark-light.svg", dark: "/webhouse-wordmark-dark.svg" },
  favicon: "/favicon.svg",
  color: "#F7BB2E",
  colorForeground: "#0D0D0D",
};

export const BRAND_PACKS: BrandPack[] = [
  {
    // Values from fysio.work's approved logo sheet (their mockup 01a156c4 v7),
    // delivered by the fysio.work session 22/10-2026.
    id: "fysio-work",
    name: "fysio.work",
    hosts: ["cms.fysio.work"],
    logo: { light: "/brands/fysio-work/logo-light.svg", dark: "/brands/fysio-work/logo-dark.svg" },
    favicon: "/brands/fysio-work/favicon.svg",
    color: "#0E4F5C",
    colorForeground: "#FFFFFF",
    colorDark: "#5FB3B3",
    // Manrope is fysio.work's heading/button/menu face (their CSS, 22/10-2026).
    font: { family: "Manrope", stylesheet: "/brands/fysio-work/fonts.css" },
    // F211.3 — Danish clinics: the admin opens in Danish unless the user picked
    // another language under Account → Language.
    defaultLocale: "da",
    // BID client «cms-fysio-work» (made by the bid session 22/10-2026), whose
    // dialog carries fysio.work's logo, icon and colours.
    bidClient: { idEnv: "BID_CLIENT_ID_FYSIO_WORK", secretEnv: "BID_CLIENT_SECRET_FYSIO_WORK" },
  },
];

/** A dev machine can preview a brand at <host>.localhost (browsers resolve
 *  *.localhost to 127.0.0.1). Harmless in production: that name never reaches
 *  the server through Fly's edge. */
const LOCALHOST_ALIAS = ".localhost";

/** webhouse's own brand — the only one that says "Powered by @webhouse/cms". */
export function isDefaultBrand(brand: BrandPack): boolean {
  return brand.id === DEFAULT_BRAND.id;
}

export function resolveBrand(host: string | null | undefined, packs: BrandPack[] = BRAND_PACKS): BrandPack {
  if (!host) return DEFAULT_BRAND;
  let name = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (name.endsWith(LOCALHOST_ALIAS)) name = name.slice(0, -LOCALHOST_ALIAS.length);
  return packs.find((p) => p.hosts.includes(name)) ?? DEFAULT_BRAND;
}

/** The address a request was made on (Fly forwards it as x-forwarded-host). */
export function requestHost(headers: { get(name: string): string | null }): string | null {
  return headers.get("x-forwarded-host") ?? headers.get("host");
}

/** The brand for an incoming request — the address it was opened on. */
export function brandForRequest(headers: { get(name: string): string | null }): BrandPack {
  return resolveBrand(requestHost(headers));
}

const HEX =/^#[0-9a-fA-F]{6}$/;

function hex(value: string, field: string): string {
  if (!HEX.test(value)) throw new Error(`brand ${field} must be a 6-digit hex colour, got ${JSON.stringify(value)}`);
  return value;
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(c: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const LIGHT_TEXT = "#FFFFFF";
const DARK_TEXT = "#0D0D0D";

/** Whichever of white / near-black reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrast(bg, LIGHT_TEXT) >= contrast(bg, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

/** F210.6 — a customer brand's "warning" (e.g. an SEO score of 50–79). Still an
 *  orange between green and red, but never webhouse gold (#F7BB2E). */
export const CUSTOMER_WARNING = "#EA580C";

/** `tint` = the menu's active-item background strength (globals.css: 15% dark, 12% light). */
function vars(color: string, fg: string, tint: number): string {
  return (
    `--brand:${color};--brand-foreground:${fg};--primary:${color};--primary-foreground:${fg};` +
    `--brand-strong:${color};--brand-strong-foreground:${fg};` +
    // F210.6 — the focus ring and the menu's active item. globals.css writes
    // them as oklch(… 85), which the F210.2 hex sweep never saw.
    `--ring:${color};--sidebar-accent:color-mix(in srgb, ${color} ${tint}%, transparent);` +
    `--sidebar-accent-foreground:${color};--status-warning:${CUSTOMER_WARNING}`
  );
}

/** The sign-in / gate screens are dark whatever the theme, so their accent
 *  text always takes the colour meant for dark backgrounds. */
function onDarkVars(onDark: string): string {
  return `--brand-on-dark:${onDark};--brand-on-dark-soft:color-mix(in srgb, ${onDark} 45%, #ffffff);--brand-tint-bg:color-mix(in srgb, ${onDark} 14%, #0a0a0a)`;
}

/**
 * The CSS that re-skins the admin for `brand`. Empty for the default brand, so
 * webhouse.app is untouched. `--status-warning` keeps its meaning (an orange
 * between green and red) but on a customer brand is not webhouse gold (F210.6).
 *
 * Selectors: dark is the default (:root) and every data-theme starting with
 * "dark"; the light rule comes after with the same specificity, so it wins on
 * light themes. `html` raises both above the plain selectors in globals.css.
 */
const FONT_FAMILY = /^[A-Za-z0-9 -]{1,64}$/;
const FONT_STYLESHEET = /^\/brands\/[a-z0-9-]+\/[a-z0-9-]+\.css$/;

/** The brand's typeface, checked — it lands inside a <style> and a <link>. */
export function brandFont(brand: BrandPack): { family: string; stylesheet: string } | null {
  if (!brand.font) return null;
  if (!FONT_FAMILY.test(brand.font.family)) throw new Error(`brand font family must be a plain name, got ${JSON.stringify(brand.font.family)}`);
  if (!FONT_STYLESHEET.test(brand.font.stylesheet)) throw new Error(`brand font stylesheet must be a self-hosted /brands/<id>/<name>.css, got ${JSON.stringify(brand.font.stylesheet)}`);
  return brand.font;
}

export function brandCss(brand: BrandPack): string {
  if (brand.id === DEFAULT_BRAND.id) return "";
  const light = hex(brand.color, "color");
  const lightFg = hex(brand.colorForeground, "colorForeground");
  const dark = brand.colorDark ? hex(brand.colorDark, "colorDark") : light;
  const darkFg = brand.colorDarkForeground
    ? hex(brand.colorDarkForeground, "colorDarkForeground")
    : brand.colorDark ? readableOn(dark) : lightFg;
  const font = brandFont(brand);
  // html:root beats the next/font class that sets Geist's --font-sans on <html>.
  const fontCss = font ? `html:root{--font-sans:"${font.family}", ui-sans-serif, system-ui, sans-serif}` : "";
  return `html:root,html[data-theme^="dark"]{${vars(dark, darkFg, 15)};${onDarkVars(dark)}}html[data-theme^="light"]{${vars(light, lightFg, 12)};${onDarkVars(dark)}}${fontCss}`;
}
