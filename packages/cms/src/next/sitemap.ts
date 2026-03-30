/**
 * F121 — Next.js sitemap handler from CMS content.
 *
 * Returns a factory function compatible with Next.js app/sitemap.ts.
 * Generates sitemap entries with hreflang alternates for multi-locale sites.
 * Uses the same URL resolution logic as the static build pipeline.
 */

import { createContentLoader } from '../adapters/nextjs.js';
import { getLocalizedDocumentUrl, getCollectionIndexUrl } from '../routing/resolver.js';
import type { Document } from '../storage/types.js';
import type { CollectionConfig } from '../schema/types.js';

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

interface SitemapEntry {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: ChangeFrequency;
  priority?: number;
  alternates?: { languages?: Record<string, string> };
}

/** Minimal collection config needed by the sitemap generator */
export interface SitemapCollection {
  name: string;
  label?: string;
  urlPrefix?: string;
  parentField?: string;
}

/**
 * Create a Next.js sitemap.ts handler that generates entries from CMS content.
 *
 * @example
 * ```ts
 * // app/sitemap.ts
 * import { cmsSitemap } from '@webhouse/cms/next';
 * export default cmsSitemap({
 *   baseUrl: 'https://example.com',
 *   collections: [
 *     { name: 'pages', urlPrefix: '/' },
 *     { name: 'posts', urlPrefix: '/blog' },
 *   ],
 * });
 * ```
 */
export function cmsSitemap(options: {
  /** Site base URL (no trailing slash) */
  baseUrl: string;
  /** Collections to include in sitemap */
  collections: SitemapCollection[];
  /** Custom content directory. Default: "./content" */
  contentDir?: string;
  /** Available locales for hreflang */
  locales?: string[];
  /** Default locale (gets x-default and no prefix) */
  defaultLocale?: string;
  /** Locale URL strategy. Default: "prefix-other" */
  localeStrategy?: string;
  /** Default changeFrequency for all entries. Default: "weekly" */
  changeFrequency?: ChangeFrequency;
  /** Default priority for document entries. Default: 0.7 */
  defaultPriority?: number;
}): () => SitemapEntry[] {
  return function sitemap(): SitemapEntry[] {
    const base = options.baseUrl.replace(/\/$/, '');
    const loader = createContentLoader(options.contentDir);
    const hasMultipleLocales = (options.locales?.length ?? 0) > 1;
    const localeConfig: { defaultLocale?: string; locales?: string[]; localeStrategy?: string } = {};
    if (options.defaultLocale) localeConfig.defaultLocale = options.defaultLocale;
    if (options.locales) localeConfig.locales = options.locales;
    if (options.localeStrategy) localeConfig.localeStrategy = options.localeStrategy;

    // Load all published documents
    const allDocsList: Document[] = [];
    const collectionDocs: Record<string, Document[]> = {};

    for (const col of options.collections) {
      const docs = loader.getCollection(col.name);
      collectionDocs[col.name] = docs;
      allDocsList.push(...docs);
    }

    const entries: SitemapEntry[] = [];
    const seen = new Set<string>();

    const addEntry = (url: string, entry: Omit<SitemapEntry, 'url'>) => {
      if (seen.has(url)) return;
      seen.add(url);
      entries.push({ url, ...entry });
    };

    // Homepage
    addEntry(`${base}/`, {
      changeFrequency: options.changeFrequency ?? 'weekly',
      priority: 1.0,
    });

    for (const col of options.collections) {
      const colConfig = col as unknown as CollectionConfig;

      // Collection index page
      addEntry(`${base}${getCollectionIndexUrl(colConfig)}`, {
        changeFrequency: options.changeFrequency ?? 'weekly',
        priority: 0.8,
      });

      const docs = collectionDocs[col.name] ?? [];
      const allDocsMap = new Map(docs.map(d => [d.id, d]));

      for (const doc of docs) {
        const docUrl = `${base}${getLocalizedDocumentUrl(doc, colConfig, localeConfig, allDocsMap)}`;

        const entry: Omit<SitemapEntry, 'url'> = {
          changeFrequency: options.changeFrequency ?? 'weekly',
          priority: options.defaultPriority ?? 0.7,
        };
        if (doc.updatedAt) entry.lastModified = new Date(doc.updatedAt);

        // Build hreflang alternates for multi-locale sites
        if (hasMultipleLocales && doc.locale) {
          const groupId = (doc as unknown as Record<string, unknown>).translationGroup as string | undefined;
          const siblings = groupId
            ? allDocsList.filter(d => d.collection === col.name && (d as unknown as Record<string, unknown>).translationGroup === groupId)
            : (() => {
                const sourceSlug = (doc as unknown as Record<string, unknown>).translationOf as string | undefined ?? doc.slug;
                return allDocsList.filter(
                  d => d.collection === col.name &&
                    (d.slug === sourceSlug || (d as unknown as Record<string, unknown>).translationOf === sourceSlug),
                );
              })();

          if (siblings.length > 1) {
            const languages: Record<string, string> = {};
            for (const s of siblings) {
              if (!s.locale) continue;
              languages[s.locale] = `${base}${getLocalizedDocumentUrl(s, colConfig, localeConfig, allDocsMap)}`;
            }
            if (Object.keys(languages).length > 1) {
              entry.alternates = { languages };
            }
          }
        }

        addEntry(docUrl, entry);
      }
    }

    return entries;
  };
}
