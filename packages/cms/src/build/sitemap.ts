import type { SiteContext } from './resolve.js';
import { getDocumentUrl, getCollectionIndexUrl, getLocalizedDocumentUrl } from '../routing/resolver.js';
import type { Document } from '../storage/types.js';

export function generateSitemap(context: SiteContext, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const hasMultipleLocales = (context.config.locales?.length ?? 0) > 1;
  const defaultLocale = context.config.defaultLocale ?? context.config.locales?.[0];

  // Collect all documents across collections for translation lookup
  const allDocsList: Document[] = Object.values(context.collections).flat();

  const seen = new Set<string>();
  const entries: string[] = [];

  const addUrl = (url: string, alternates?: Record<string, string>) => {
    if (seen.has(url)) return;
    seen.add(url);
    if (alternates && Object.keys(alternates).length > 1) {
      // Multiple alternates: emit xhtml:link entries
      const links = Object.entries(alternates)
        .map(([locale, href]) => `    <xhtml:link rel="alternate" hreflang="${locale}" href="${href}"/>`)
        .join('\n');
      // Add x-default pointing to the default locale version
      const xDefault = defaultLocale && alternates[defaultLocale]
        ? `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${alternates[defaultLocale]}"/>`
        : '';
      entries.push(`  <url>\n    <loc>${url}</loc>\n${links}${xDefault}\n  </url>`);
    } else {
      entries.push(`  <url><loc>${url}</loc></url>`);
    }
  };

  addUrl(`${base}/`);

  for (const col of context.config.collections) {
    addUrl(`${base}${getCollectionIndexUrl(col)}`);
    const docs = context.collections[col.name] ?? [];
    const allDocsMap = new Map(docs.map(d => [d.id, d]));

    for (const doc of docs) {
      const docUrl = `${base}${getLocalizedDocumentUrl(doc, col, context.config, allDocsMap)}`;

      // Build hreflang alternates if the site has multiple locales
      let alternates: Record<string, string> | undefined;
      if (hasMultipleLocales && doc.locale) {
        const sourceSlug = doc.translationOf ?? doc.slug;
        const siblings = allDocsList.filter(
          d => d.collection === col.name && (d.slug === sourceSlug || d.translationOf === sourceSlug),
        );
        if (siblings.length > 1) {
          alternates = {};
          for (const s of siblings) {
            if (!s.locale) continue;
            alternates[s.locale] = `${base}${getLocalizedDocumentUrl(s, col, context.config, allDocsMap)}`;
          }
        }
      }

      addUrl(docUrl, alternates);
    }
  }

  const xmlns = hasMultipleLocales
    ? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
    : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlns}\n${entries.join('\n')}\n</urlset>`;
}
