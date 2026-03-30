/**
 * @webhouse/cms/next — Drop-in SEO & discoverability helpers for Next.js.
 *
 * All functions auto-generate from CMS content and _seo fields.
 * No new logic — wraps the existing build pipeline for Next.js consumption.
 *
 * @example
 * ```ts
 * import { cmsSitemap, cmsRobots, cmsMetadata, cmsJsonLd } from '@webhouse/cms/next';
 * ```
 */

export { cmsSitemap } from './sitemap.js';
export type { SitemapCollection } from './sitemap.js';

export { cmsRobots } from './robots.js';

export { cmsLlmsTxt, cmsLlmsFullTxt } from './llms.js';

export { cmsMetadata } from './metadata.js';

export { cmsJsonLd } from './json-ld.js';

export { cmsGenerateStaticParams } from './static-params.js';

export { cmsFeed } from './feed.js';
