/**
 * F212 — white-label docs. On a customer's address (cms.fysio.work) /docs is
 * the docs app (the same one that serves docs.webhouse.app), forwarded by
 * proxy.ts. No machine of its own: the docs app renders itself in the
 * customer's name, colours and language from the x-docs-brand header, which
 * carries the brand pack's PUBLIC fields — the pack stays the one source.
 */
import { isDefaultBrand, type BrandPack } from "./brand";

export const DOCS_BRAND_HEADER = "x-docs-brand";

/** The only request headers the docs app gets. An allowlist, not a
 *  denylist: the admin's cookies, tokens and anything added later stay here. */
const FORWARDED = [
  "accept",
  "accept-language",
  "user-agent",
  "if-none-match",
  "if-modified-since",
  "range",
  // Next's client router (soft navigation inside the docs).
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "next-url",
];

export function isDocsPath(pathname: string): boolean {
  return pathname === "/docs" || pathname.startsWith("/docs/");
}

/** The brand's public face, as the docs app reads it. */
export function docsBrandHeader(brand: BrandPack): string {
  return JSON.stringify({
    id: brand.id,
    address: brand.hosts[0],
    locale: brand.defaultLocale ?? "en",
    color: brand.color,
    colorForeground: brand.colorForeground,
    colorDark: brand.colorDark,
    colorDarkForeground: brand.colorDarkForeground,
    logoLight: brand.logo.light,
    logoDark: brand.logo.dark,
    favicon: brand.favicon,
    fontFamily: brand.font?.family,
    fontStylesheet: brand.font?.stylesheet,
  });
}

/**
 * Where to forward a /docs request, with which headers — or null when this
 * address has no white-label docs (webhouse's own brand, whose docs live on
 * docs.webhouse.app, or no DOCS_ORIGIN configured).
 */
export function docsForward(
  brand: BrandPack,
  url: URL,
  headers: Headers,
  docsOrigin: string | undefined,
): { target: URL; headers: Headers } | null {
  if (isDefaultBrand(brand) || !docsOrigin || !brand.hosts[0]) return null;
  const target = new URL(`${url.pathname}${url.search}`, docsOrigin);
  const out = new Headers();
  for (const name of FORWARDED) {
    const value = headers.get(name);
    if (value !== null) out.set(name, value);
  }
  out.set(DOCS_BRAND_HEADER, docsBrandHeader(brand));
  return { target, headers: out };
}
