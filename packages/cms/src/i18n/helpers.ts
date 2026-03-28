/**
 * F48 — i18n Routing Helpers
 *
 * Exported from @webhouse/cms for site developers building multi-locale sites.
 * Works with Next.js App Router, static site generators, and custom builds.
 */

import type { Document } from '../storage/types.js';
import type { CollectionConfig, CmsConfig } from '../schema/types.js';
import { getLocalizedDocumentUrl } from '../routing/resolver.js';

/**
 * Generate static params for all locale variants of a collection.
 * For Next.js `generateStaticParams()` in App Router.
 *
 * @example
 * export async function generateStaticParams() {
 *   return generateI18nStaticParams(cms, 'posts', ['da', 'en']);
 * }
 */
export async function generateI18nStaticParams(
  cms: { content: { findMany: (col: string, opts: any) => Promise<{ documents: Document[] }> } },
  collection: string,
  locales: string[],
): Promise<Array<{ slug: string; locale: string }>> {
  const { documents } = await cms.content.findMany(collection, { status: 'published' });
  const params: Array<{ slug: string; locale: string }> = [];

  for (const doc of documents) {
    params.push({ slug: doc.slug, locale: doc.locale ?? locales[0] ?? 'en' });
  }

  return params;
}

/**
 * Get a document in a specific locale, with fallback to source.
 * Looks for a translation of the given slug in the target locale.
 */
export async function getLocalizedDocument(
  cms: { content: { findMany: (col: string, opts: any) => Promise<{ documents: Document[] }> } },
  collection: string,
  slug: string,
  locale: string,
  defaultLocale: string,
): Promise<Document | null> {
  const { documents } = await cms.content.findMany(collection, {});

  // Direct match: document with this slug and locale
  const direct = documents.find(d => d.slug === slug && d.locale === locale);
  if (direct) return direct;

  // Translation match: document that is a translation of this slug
  const translation = documents.find(
    d => (d as any).translationOf === slug && d.locale === locale
  );
  if (translation) return translation;

  // Fallback: return the source document (default locale)
  if (locale !== defaultLocale) {
    const source = documents.find(d => d.slug === slug && (!d.locale || d.locale === defaultLocale));
    if (source) return source;
  }

  // Last resort: any document with this slug
  return documents.find(d => d.slug === slug) ?? null;
}

/**
 * Get hreflang alternate links for a document.
 * Returns array suitable for `<link rel="alternate" hreflang="..." href="...">`.
 */
export function getHreflangAlternates(
  doc: Document,
  collection: CollectionConfig,
  config: { defaultLocale?: string; locales?: string[]; localeStrategy?: string },
  allDocuments: Document[],
  baseUrl: string,
): Array<{ locale: string; href: string }> {
  const locales = config.locales ?? [];
  if (locales.length <= 1) return [];

  const allDocsMap = new Map(allDocuments.map(d => [d.id, d]));
  const results: Array<{ locale: string; href: string }> = [];
  const sourceSlug = (doc as any).translationOf || doc.slug;

  // Find source document and all translations
  const family = allDocuments.filter(d =>
    d.slug === sourceSlug ||
    (d as any).translationOf === sourceSlug
  );

  for (const sibling of family) {
    const locale = sibling.locale ?? config.defaultLocale ?? locales[0] ?? 'en';
    const url = getLocalizedDocumentUrl(sibling, collection, config, allDocsMap);
    results.push({ locale: locale, href: `${baseUrl.replace(/\/$/, '')}${url}` });
  }

  return results;
}

/**
 * Check if a translation is stale (source was updated after translation).
 */
export function isTranslationStale(
  sourceUpdatedAt: string,
  translationUpdatedAt: string,
): boolean {
  if (!sourceUpdatedAt || !translationUpdatedAt) return false;
  return new Date(sourceUpdatedAt) > new Date(translationUpdatedAt);
}
