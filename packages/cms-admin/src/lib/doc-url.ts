/**
 * The public path a document renders at.
 *
 * Extracted from collection-list.tsx's docPreviewUrl (F164.2) so the link
 * picker and the preview button cannot drift apart. "Preview MUST Always Work"
 * is a hard rule in this repo, and a link that points somewhere preview doesn't
 * is the same bug wearing a different hat — so there is ONE implementation.
 *
 * Returns a path (leading slash, no origin). Prepend previewSiteUrl for a URL.
 */

export type LocaleStrategy = "prefix-all" | "prefix-other" | "none";

export interface DocUrlDoc {
  slug: string;
  locale?: string;
  data?: Record<string, unknown>;
}

export interface DocUrlOptions {
  collection: string;
  urlPrefix?: string;
  /** e.g. "/:category/:slug" — fields resolved from doc.data. */
  urlPattern?: string;
  localeStrategy?: LocaleStrategy;
  defaultLocale?: string;
}

export function docPath(doc: DocUrlDoc, opts: DocUrlOptions): string {
  const { collection, urlPrefix, urlPattern, localeStrategy = "prefix-other", defaultLocale } = opts;
  // The "/<collection>" fallback is a GUESS for a collection that never said
  // where it renders. A urlPattern IS that statement — it describes the whole
  // path — so guessing a prefix in front of it invents a segment that does not
  // exist. Measured on broberg-ai: posts declares urlPattern "/:category/:slug"
  // and no urlPrefix, and the guess produced /en/posts/ai-metode/<slug> (404)
  // instead of /en/ai-metode/<slug> (200). An explicit urlPrefix is still
  // honoured alongside a pattern — that combination is a deliberate statement.
  const defaultPrefix = urlPattern ? "" : `/${collection}`;
  const prefix = (urlPrefix ?? defaultPrefix).replace(/\/$/, "");
  const docLocale = doc.locale ?? "";
  const fallbackLocale = defaultLocale ?? "en";

  const usesLocalePrefix =
    (localeStrategy === "prefix-all" && !!docLocale) ||
    (localeStrategy === "prefix-other" && !!docLocale && docLocale !== fallbackLocale);

  // A non-default locale's slug carries a "-<locale>" suffix that the URL does
  // not repeat — the locale is already in the prefix.
  let baseSlug = doc.slug;
  if (usesLocalePrefix && docLocale && docLocale !== fallbackLocale) {
    const suffix = `-${docLocale}`;
    if (baseSlug.endsWith(suffix)) baseSlug = baseSlug.slice(0, -suffix.length);
  }

  const isHomepage =
    (prefix === "" || prefix === "/") && (baseSlug === "home" || baseSlug === "index");

  let slugPath = baseSlug;
  if (urlPattern) {
    slugPath = urlPattern.replace(/^\//, "").replace(/:([a-zA-Z_]+)/g, (_m, field: string) => {
      if (field === "slug") return baseSlug;
      const val = doc.data?.[field];
      return typeof val === "string" ? val : "";
    });
  }

  // "none" bakes the locale into the slug itself — use it verbatim.
  if (localeStrategy === "none") slugPath = doc.slug;

  const locPrefix = usesLocalePrefix ? `/${docLocale}` : "";

  return isHomepage
    ? locPrefix
      ? `${locPrefix}/`
      : "/"
    : `${locPrefix}${prefix}/${slugPath}`;
}
