/**
 * F121 — llms.txt route handlers for Next.js.
 *
 * Wraps the existing generateLlmsTxt() and generateLlmsFullTxt() from
 * the static build pipeline as Next.js route handlers.
 */

import { createContentLoader } from '../adapters/nextjs.js';
import { generateLlmsTxt, generateLlmsFullTxt } from '../build/llms.js';
import type { SiteContext } from '../build/resolve.js';
import type { Document } from '../storage/types.js';

/** Minimal collection config for llms.txt generation */
interface LlmsCollection {
  name: string;
  label?: string;
  urlPrefix?: string;
}

interface LlmsOptions {
  /** Site base URL (no trailing slash) */
  baseUrl: string;
  /** Site title shown in the llms.txt header */
  siteTitle: string;
  /** Site description */
  siteDescription?: string;
  /** Collections to include */
  collections: LlmsCollection[];
  /** Custom content directory. Default: "./content" */
  contentDir?: string;
  /** Default locale */
  defaultLocale?: string;
  /** Available locales */
  locales?: string[];
}

/** Build a minimal SiteContext from adapter data for the build functions */
function buildContext(options: LlmsOptions): SiteContext {
  const loader = createContentLoader(options.contentDir);
  const collections: Record<string, Document[]> = {};

  for (const col of options.collections) {
    collections[col.name] = loader.getCollection(col.name);
  }

  // Build a minimal CmsConfig that satisfies the generate functions.
  // The build functions only read siteTitle/siteDescription via loose casts,
  // so we construct just what they need.
  const config = {
    collections: options.collections.map(c => ({
      name: c.name,
      label: c.label,
      urlPrefix: c.urlPrefix,
      fields: [] as never[],
    })),
    build: {
      siteTitle: options.siteTitle,
      siteDescription: options.siteDescription,
    },
  } as SiteContext['config'];
  if (options.defaultLocale) config.defaultLocale = options.defaultLocale;
  if (options.locales) config.locales = options.locales;

  return { config, collections };
}

/**
 * Create a route handler for /llms.txt (index only).
 *
 * @example
 * ```ts
 * // app/llms.txt/route.ts
 * import { cmsLlmsTxt } from '@webhouse/cms/next';
 * export const GET = cmsLlmsTxt({
 *   baseUrl: 'https://example.com',
 *   siteTitle: 'My Site',
 *   collections: [{ name: 'posts', label: 'Blog Posts' }],
 * });
 * ```
 */
export function cmsLlmsTxt(options: LlmsOptions): () => Response {
  return function GET(): Response {
    const context = buildContext(options);
    const base = options.baseUrl.replace(/\/$/, '');
    const text = generateLlmsTxt(context, base);
    return new Response(text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  };
}

/**
 * Create a route handler for /llms-full.txt (complete content export).
 *
 * @example
 * ```ts
 * // app/llms-full.txt/route.ts
 * import { cmsLlmsFullTxt } from '@webhouse/cms/next';
 * export const GET = cmsLlmsFullTxt({ ... });
 * ```
 */
export function cmsLlmsFullTxt(options: LlmsOptions): () => Response {
  return function GET(): Response {
    const context = buildContext(options);
    const base = options.baseUrl.replace(/\/$/, '');
    const text = generateLlmsFullTxt(context, base);
    return new Response(text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  };
}
