/**
 * RSS 2.0 feed generator.
 *
 * Generates /feed.xml with all or selected collections.
 * Each published document becomes an <item> with title, link, description, pubDate.
 */
import type { SiteContext } from './resolve.js';
import type { Document } from '../storage/types.js';

export interface RssConfig {
  /** Title of the feed. Defaults to site title. */
  title?: string;
  /** Feed description. */
  description?: string;
  /** Language code (e.g. "en", "da"). */
  language?: string;
  /** Limit to specific collections. Empty/undefined = all collections. */
  collections?: string[];
  /** Max items in feed. Default: 50. */
  maxItems?: number;
}

/** Strip HTML tags for plain-text description */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escape XML special characters */
function escXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Truncate to N characters on a word boundary */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

export function generateRssFeed(context: SiteContext, baseUrl: string, rssConfig?: RssConfig): string {
  const base = baseUrl.replace(/\/$/, '');
  const cfg = rssConfig ?? {};
  const maxItems = cfg.maxItems ?? 50;
  const siteTitle = cfg.title ?? (context.config.build as Record<string, unknown> | undefined)?.['siteTitle'] as string ?? 'Site';
  const siteDesc = cfg.description ?? `Latest content from ${siteTitle}`;
  const lang = cfg.language ?? context.config.defaultLocale ?? 'en';
  const selectedCollections = cfg.collections ?? [];

  // Collect all published documents from selected (or all) collections
  const allDocs: (Document & { _col: string })[] = [];

  for (const col of context.config.collections) {
    if (selectedCollections.length > 0 && !selectedCollections.includes(col.name)) continue;
    const docs = context.collections[col.name] ?? [];
    for (const doc of docs) {
      allDocs.push({ ...doc, _col: col.name });
    }
  }

  // Sort by updatedAt/createdAt descending, take maxItems
  allDocs.sort((a, b) => {
    const da = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const db = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return db - da;
  });
  const items = allDocs.slice(0, maxItems);

  // Build items XML
  const itemsXml = items.map((doc) => {
    const data = doc.data as Record<string, unknown>;
    const title = String(data.title ?? data.name ?? doc.slug);
    const col = context.config.collections.find((c) => c.name === (doc as unknown as { _col: string })._col);
    const rawPrefix = col?.urlPrefix ?? `/${col?.name ?? 'unknown'}`;
    const prefix = rawPrefix === '/' ? '' : rawPrefix.replace(/\/+$/, '');
    const url = `${base}${prefix}/${doc.slug}/`;

    // Description: excerpt > metaDescription > content snippet
    const rawDesc = String(data.excerpt ?? data.description ?? (data._seo as Record<string, unknown> | undefined)?.metaDescription ?? data.content ?? '');
    const description = truncate(stripHtml(rawDesc), 500);

    const pubDate = doc.updatedAt ?? doc.createdAt ?? new Date().toISOString();
    const rfc822 = new Date(pubDate).toUTCString();

    return `    <item>
      <title>${escXml(title)}</title>
      <link>${escXml(url)}</link>
      <description>${escXml(description)}</description>
      <pubDate>${rfc822}</pubDate>
      <guid isPermaLink="true">${escXml(url)}</guid>
    </item>`;
  }).join('\n');

  const buildDate = new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escXml(siteTitle)}</title>
    <link>${base}</link>
    <description>${escXml(siteDesc)}</description>
    <language>${lang}</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>
    <generator>@webhouse/cms</generator>
${itemsXml}
  </channel>
</rss>
`;
}
