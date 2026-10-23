/**
 * F48 — i18n Locale Helpers
 *
 * Pure functions for locale resolution. No filesystem or cookie dependencies.
 * Async variants that read site-config are in locale-config.ts.
 */

/** Get the locale for a document, falling back to site default, then "en" */
export function getDocLocale(
  doc: { locale?: string },
  siteDefault?: string,
): string {
  if (doc.locale) return doc.locale;
  return siteDefault || "en";
}

/** Get all supported locales for a site (pure — pass config values) */
export function getSiteLocales(
  defaultLocale?: string,
  locales?: string[],
): { default: string; all: string[] } {
  const def = defaultLocale || "en";
  const all = locales?.length ? locales : [def];
  return { default: def, all };
}

/** ISO 639-1 language display names */
export const LOCALE_LABELS: Record<string, string> = {
  da: "Dansk", // i18n-ignore: language name list (endonyms), not translated
  en: "English", // i18n-ignore: language name list (endonyms), not translated
  de: "Deutsch", // i18n-ignore: language name list (endonyms), not translated
  fr: "Francais", // i18n-ignore: language name list (endonyms), not translated
  es: "Espanol", // i18n-ignore: language name list (endonyms), not translated
  sv: "Svenska", // i18n-ignore: language name list (endonyms), not translated
  nb: "Norsk", // i18n-ignore: language name list (endonyms), not translated
  nl: "Nederlands", // i18n-ignore: language name list (endonyms), not translated
  fi: "Suomi", // i18n-ignore: language name list (endonyms), not translated
  it: "Italiano", // i18n-ignore: language name list (endonyms), not translated
  pt: "Portugues", // i18n-ignore: language name list (endonyms), not translated
  pl: "Polski", // i18n-ignore: language name list (endonyms), not translated
  uk: "Ukrajinska", // i18n-ignore: language name list (endonyms), not translated
  ro: "Romana", // i18n-ignore: language name list (endonyms), not translated
  bg: "Bulgarski", // i18n-ignore: language name list (endonyms), not translated
  lt: "Lietuviu", // i18n-ignore: language name list (endonyms), not translated
  ja: "Japanese", // i18n-ignore: language name list (endonyms), not translated
  zh: "Chinese", // i18n-ignore: language name list (endonyms), not translated
  ko: "Korean", // i18n-ignore: language name list (endonyms), not translated
};

/** Check if a translation is stale (source was updated after translation) */
export function isTranslationStale(
  sourceUpdatedAt: string,
  translationUpdatedAt: string,
): boolean {
  if (!sourceUpdatedAt || !translationUpdatedAt) return false;
  return new Date(sourceUpdatedAt) > new Date(translationUpdatedAt);
}

/** Flag emoji for locale */
export const LOCALE_FLAGS: Record<string, string> = {
  da: "\u{1F1E9}\u{1F1F0}",
  en: "\u{1F1EC}\u{1F1E7}",
  de: "\u{1F1E9}\u{1F1EA}",
  fr: "\u{1F1EB}\u{1F1F7}",
  es: "\u{1F1EA}\u{1F1F8}",
  sv: "\u{1F1F8}\u{1F1EA}",
  nb: "\u{1F1F3}\u{1F1F4}",
  nl: "\u{1F1F3}\u{1F1F1}",
  fi: "\u{1F1EB}\u{1F1EE}",
  it: "\u{1F1EE}\u{1F1F9}",
  pt: "\u{1F1F5}\u{1F1F9}",
  pl: "\u{1F1F5}\u{1F1F1}",
  uk: "\u{1F1FA}\u{1F1E6}",
  ro: "\u{1F1F7}\u{1F1F4}",
  bg: "\u{1F1E7}\u{1F1EC}",
  lt: "\u{1F1F1}\u{1F1F9}",
  ja: "\u{1F1EF}\u{1F1F5}",
  zh: "\u{1F1E8}\u{1F1F3}",
  ko: "\u{1F1F0}\u{1F1F7}",
};
