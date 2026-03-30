/**
 * F121 — JSON-LD extraction from CMS documents.
 *
 * Extracts structured data from the _seo.jsonLd field.
 * Use in page components with <script type="application/ld+json">.
 */

/**
 * Extract JSON-LD structured data from a CMS document.
 *
 * @example
 * ```tsx
 * const jsonLd = cmsJsonLd(doc);
 * {jsonLd && (
 *   <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
 * )}
 * ```
 */
export function cmsJsonLd(doc: { data: Record<string, unknown> }): Record<string, unknown> | null {
  const seo = doc.data._seo as Record<string, unknown> | undefined;
  if (!seo?.jsonLd) return null;
  return seo.jsonLd as Record<string, unknown>;
}
