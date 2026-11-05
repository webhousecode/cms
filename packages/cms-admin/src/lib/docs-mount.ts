/**
 * F212 — the docs. On every address (webhouse.app/docs, cms.fysio.work/docs)
 * /docs is the docs app, which runs as a second process on this same machine
 * (DOCS_ORIGIN) and is forwarded by proxy.ts — no machine of its own. It
 * renders itself in the brand's name, colours and language from the
 * x-docs-brand header, which carries the brand pack's PUBLIC fields — the
 * pack stays the one source.
 */
import type { BrandPack } from "./brand";

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
    // webhouse's own pack has no hosts (it is the fallback); its name is its address.
    address: brand.hosts[0] ?? brand.name,
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
 * Where to forward a /docs request, with which headers — or null when no
 * DOCS_ORIGIN is configured (no hard-coded fallback).
 */
export function docsForward(
  brand: BrandPack,
  url: URL,
  headers: Headers,
  docsOrigin: string | undefined,
): { target: URL; headers: Headers } | null {
  if (!docsOrigin) return null;
  const target = new URL(`${url.pathname}${url.search}`, docsOrigin);
  const out = new Headers();
  for (const name of FORWARDED) {
    const value = headers.get(name);
    if (value !== null) out.set(name, value);
  }
  out.set(DOCS_BRAND_HEADER, docsBrandHeader(brand));
  return { target, headers: out };
}
