/**
 * F121 — Next.js Metadata builder from CMS _seo fields.
 *
 * Extracts SEO data from a CMS document and returns a Next.js Metadata-compatible object.
 * Works with any document that has optional _seo fields from F97 SEO Module.
 */

interface SeoFields {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  ogImage?: string;
  canonical?: string;
  robots?: string;
  jsonLd?: Record<string, unknown>;
}

interface GeoLocation {
  lat?: number;
  lng?: number;
  address?: string;
}

/**
 * Build a Next.js Metadata object from a CMS document's _seo fields.
 *
 * @example
 * ```ts
 * // app/blog/[slug]/page.tsx
 * import { cmsMetadata } from '@webhouse/cms/next';
 *
 * export async function generateMetadata({ params }) {
 *   const doc = getDocument('posts', params.slug);
 *   if (!doc) return {};
 *   return cmsMetadata({ baseUrl: 'https://example.com', siteName: 'My Site', doc, urlPrefix: '/blog' });
 * }
 * ```
 */
export function cmsMetadata(options: {
  /** Site base URL (no trailing slash) */
  baseUrl: string;
  /** Site name for OpenGraph */
  siteName: string;
  /** CMS document with data and slug */
  doc: { data: Record<string, unknown>; slug: string };
  /** Collection name (used in og:type heuristics) */
  collection?: string;
  /** URL prefix for this collection (e.g. "/blog") */
  urlPrefix?: string;
}): Record<string, unknown> {
  const { baseUrl, siteName, doc, urlPrefix } = options;
  const base = baseUrl.replace(/\/$/, '');
  const prefix = urlPrefix ? (urlPrefix === '/' ? '' : urlPrefix.replace(/\/+$/, '')) : '';
  const seo = doc.data._seo as SeoFields | undefined;

  const title = seo?.metaTitle || String(doc.data.title ?? doc.slug);
  const description = seo?.metaDescription || String(doc.data.excerpt ?? doc.data.description ?? '');
  const canonicalUrl = seo?.canonical || `${base}${prefix}/${doc.slug}`;
  const ogType = options.collection === 'pages' ? 'website' : 'article';

  const metadata: Record<string, unknown> = {
    title,
    description: description || undefined,
    openGraph: {
      title,
      description: description || undefined,
      images: seo?.ogImage ? [{ url: seo.ogImage.startsWith('http') ? seo.ogImage : `${base}${seo.ogImage}` }] : undefined,
      siteName,
      type: ogType,
      url: canonicalUrl,
      ...(ogType === 'article' && doc.data.date ? { publishedTime: String(doc.data.date) } : {}),
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };

  if (seo?.keywords?.length) {
    metadata.keywords = seo.keywords;
  }

  if (seo?.robots) {
    metadata.robots = seo.robots;
  }

  // Geo meta from map fields (F96)
  const geoMeta = buildGeoMeta(doc.data);
  if (geoMeta) {
    metadata.other = geoMeta;
  }

  return metadata;
}

/** Extract geo meta tags from map-type fields in document data */
function buildGeoMeta(data: Record<string, unknown>): Record<string, string> | undefined {
  // Scan all fields for map-type data (object with lat/lng)
  for (const val of Object.values(data)) {
    if (val && typeof val === 'object' && 'lat' in val && 'lng' in val) {
      const geo = val as GeoLocation;
      if (typeof geo.lat !== 'number' || typeof geo.lng !== 'number') continue;
      const meta: Record<string, string> = {
        'geo.position': `${geo.lat};${geo.lng}`,
        'ICBM': `${geo.lat}, ${geo.lng}`,
      };
      if (geo.address) {
        meta['geo.placename'] = geo.address;
      }
      return meta;
    }
  }
  return undefined;
}
