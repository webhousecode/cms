/**
 * F211 — the admin's own language (menus, buttons, messages). Not the
 * language of a site's content; that is F48 and lib/locale.ts.
 *
 * English is the source language of the catalog; Danish is the first
 * translation. A new language is a new messages/<code>.json plus one entry in
 * UI_LOCALES — no other code changes.
 *
 * Everything here is pure: the request decides the locale and passes it in.
 * No module-level "current locale" — concurrent requests in different
 * languages must never see each other's choice.
 */
import { translate, type Dict } from "@broberg/i18n";
import en from "./messages/en.json";
import da from "./messages/da.json";

export const UI_LOCALES = ["en", "da"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const SOURCE_LOCALE: UiLocale = "en";

/** Each language named in itself — what a reader looks for in a picker. */
export const LANGUAGE_NAMES: Record<UiLocale, string> = { en: "English", da: "Dansk" };

export const MESSAGES: Record<UiLocale, Dict> = { en, da };

export function isUiLocale(v: unknown): v is UiLocale {
  return typeof v === "string" && (UI_LOCALES as readonly string[]).includes(v);
}

/** First supported language in an Accept-Language header, by its primary tag. */
function fromAcceptLanguage(header: string | null | undefined): UiLocale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: (tag ?? "").toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) if (isUiLocale(lang)) return lang;
  return null;
}

/**
 * The admin language for one request: the user's own choice → the brand's
 * default (cms.fysio.work opens in Danish) → the browser → English.
 * Anything that is not a supported language is skipped, never trusted.
 */
export function resolveUiLocale(input: {
  user?: string | null;
  brand?: string | null;
  acceptLanguage?: string | null;
}): UiLocale {
  if (isUiLocale(input.user)) return input.user;
  if (isUiLocale(input.brand)) return input.brand;
  return fromAcceptLanguage(input.acceptLanguage) ?? SOURCE_LOCALE;
}

/** Translate for one request. Missing in `locale` → English → the key itself. */
export function getT(locale: UiLocale) {
  return (key: string, vars?: Record<string, string | number>) =>
    translate(MESSAGES, locale, key, vars, { fallbackLocale: SOURCE_LOCALE });
}

/** Only what the browser needs: the active language and the English fallback. */
export function clientMessages(locale: UiLocale): Partial<Record<UiLocale, Dict>> {
  return locale === SOURCE_LOCALE ? { en: MESSAGES.en } : { en: MESSAGES.en, [locale]: MESSAGES[locale] };
}
