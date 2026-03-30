/**
 * F121 — RSS feed route handler for Next.js.
 *
 * Wraps the existing generateRssFeed() from the static build pipeline
 * as a Next.js route handler returning valid RSS 2.0 XML.
 */

import { createContentLoader } from '../adapters/nextjs.js';
import { generateRssFeed } from '../build/rss.js';
import type { SiteContext } from '../build/resolve.js';
import type { Document } from '../storage/types.js';

/** Minimal collection config for RSS feed generation */
interface FeedCollection {
  name: string;
  label?: string;
  urlPrefix?: string;
}

/**
 * Create a route handler for /feed.xml (RSS 2.0).
 *
 * @example
 * ```ts
 * // app/feed.xml/route.ts
 * import { cmsFeed } from '@webhouse/cms/next';
 * export const GET = cmsFeed({
 *   baseUrl: 'https://example.com',
 *   title: 'My Blog',
 *   collections: [{ name: 'posts', urlPrefix: '/blog' }],
 * });
 * ```
 */
export function cmsFeed(options: {
  /** Site base URL (no trailing slash) */
  baseUrl: string;
  /** Feed title */
  title: string;
  /** Feed description */
  description?: string;
  /** Collections to include in feed */
  collections: FeedCollection[];
  /** Custom content directory. Default: "./content" */
  contentDir?: string;
  /** Language code (e.g. "en", "da"). Default: "en" */
  language?: string;
  /** Max items in feed. Default: 50 */
  maxItems?: number;
  /** Default locale */
  defaultLocale?: string;
}): () => Response {
  return function GET(): Response {
    const loader = createContentLoader(options.contentDir);
    const base = options.baseUrl.replace(/\/$/, '');
    const collections: Record<string, Document[]> = {};

    for (const col of options.collections) {
      collections[col.name] = loader.getCollection(col.name);
    }

    const config = {
      collections: options.collections.map(c => ({
        name: c.name,
        label: c.label,
        urlPrefix: c.urlPrefix,
        fields: [] as never[],
      })),
      build: { siteTitle: options.title },
    } as SiteContext['config'];
    if (options.defaultLocale) config.defaultLocale = options.defaultLocale;

    const context: SiteContext = { config, collections };

    const rssConfig: Record<string, unknown> = { title: options.title };
    if (options.description) rssConfig.description = options.description;
    if (options.language) rssConfig.language = options.language;
    if (options.maxItems) rssConfig.maxItems = options.maxItems;

    const xml = generateRssFeed(context, base, rssConfig as Parameters<typeof generateRssFeed>[2]);

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  };
}
