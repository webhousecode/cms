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

/** The brand for an incoming request — the address it was opened on. */
export function brandForRequest(headers: { get(name: string): string | null }): BrandPack {
  return resolveBrand(headers.get("x-forwarded-host") ?? headers.get("host"));
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

function vars(color: string, fg: string): string {
  return `--brand:${color};--brand-foreground:${fg};--primary:${color};--primary-foreground:${fg};--brand-strong:${color};--brand-strong-foreground:${fg}`;
}

/** The sign-in / gate screens are dark whatever the theme, so their accent
 *  text always takes the colour meant for dark backgrounds. */
function onDarkVars(onDark: string): string {
  return `--brand-on-dark:${onDark};--brand-on-dark-soft:color-mix(in srgb, ${onDark} 45%, #ffffff);--brand-tint-bg:color-mix(in srgb, ${onDark} 14%, #0a0a0a)`;
}

/**
 * The CSS that re-skins the admin for `brand`. Empty for the default brand, so
 * webhouse.app is untouched. `--status-warning` (the amber of a score) is
 * deliberately left alone: it is a signal, not the brand.
 *
 * Selectors: dark is the default (:root) and every data-theme starting with
 * "dark"; the light rule comes after with the same specificity, so it wins on
 * light themes. `html` raises both above the plain selectors in globals.css.
 */
export function brandCss(brand: BrandPack): string {
  if (brand.id === DEFAULT_BRAND.id) return "";
  const light = hex(brand.color, "color");
  const lightFg = hex(brand.colorForeground, "colorForeground");
  const dark = brand.colorDark ? hex(brand.colorDark, "colorDark") : light;
  const darkFg = brand.colorDarkForeground
    ? hex(brand.colorDarkForeground, "colorDarkForeground")
    : brand.colorDark ? readableOn(dark) : lightFg;
  return `html:root,html[data-theme^="dark"]{${vars(dark, darkFg)};${onDarkVars(dark)}}html[data-theme^="light"]{${vars(light, lightFg)};${onDarkVars(dark)}}`;
}
