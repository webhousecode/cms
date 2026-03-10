import type { SiteContext } from './resolve.js';
import { getDocumentUrl, getCollectionIndexUrl } from '../routing/resolver.js';

export function generateSitemap(context: SiteContext, baseUrl: string): string {
  const urls: string[] = [];
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const seen = new Set<string>();
  const addUrl = (url: string) => {
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  addUrl(`${base}/`);

  for (const col of context.config.collections) {
    addUrl(`${base}${getCollectionIndexUrl(col)}`);
    const docs = context.collections[col.name] ?? [];
    const allDocsMap = new Map(docs.map(d => [d.id, d]));
    for (const doc of docs) {
      addUrl(`${base}${getDocumentUrl(doc, col, allDocsMap)}`);
    }
  }

  const entries = urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}
