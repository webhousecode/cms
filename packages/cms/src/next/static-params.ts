/**
 * F121 — generateStaticParams factory for CMS collections.
 *
 * Returns a function compatible with Next.js generateStaticParams().
 * Lists all published document slugs for a given collection.
 */

import { createContentLoader } from '../adapters/nextjs.js';

/**
 * Create a generateStaticParams function for a CMS collection.
 *
 * @example
 * ```ts
 * // app/blog/[slug]/page.tsx
 * import { cmsGenerateStaticParams } from '@webhouse/cms/next';
 * export const generateStaticParams = cmsGenerateStaticParams({ collection: 'posts' });
 * ```
 */
export function cmsGenerateStaticParams(options: {
  /** Collection name to list slugs from */
  collection: string;
  /** URL parameter name. Default: "slug" */
  paramName?: string;
  /** Filter by status. Default: "published" */
  status?: 'published' | 'draft' | 'all';
  /** Custom content directory. Default: "./content" */
  contentDir?: string;
}): () => Array<Record<string, string>> {
  return function generateStaticParams(): Array<Record<string, string>> {
    const loader = createContentLoader(options.contentDir);
    const status = options.status ?? 'published';
    const paramName = options.paramName ?? 'slug';
    const docs = loader.getCollection(options.collection, { status });
    return docs.map(d => ({ [paramName]: d.slug }));
  };
}
