/**
 * F81 — Homepage Designation.
 *
 * Resolves "which document maps to /" for the active site. Falls back
 * to slug conventions (home, index) when no explicit setting exists,
 * so pre-F81 sites keep working.
 */
import type { SiteEntry } from "./site-registry";

export interface HomepageInfo {
  collection: string;
  slug: string;
  /** True if explicitly set via Site Settings, false if inferred from convention */
  explicit: boolean;
}

const CONVENTION_SLUGS = ["home", "index"];
const DEFAULT_HOMEPAGE_COLLECTION = "pages";

/**
 * Check if a specific document is the designated homepage.
 *
 * @param site — Active site entry (may have homepageSlug set)
 * @param collection — Collection name of the document
 * @param slug — Slug of the document
 * @param collectionUrlPrefix — Optional urlPrefix from the collection config (for convention fallback)
 */
export function isHomepage(
  site: SiteEntry | null | undefined,
  collection: string,
  slug: string,
  collectionUrlPrefix?: string,
): boolean {
  // 1. Explicit setting takes priority
  if (site?.homepageSlug) {
    const expectedCollection = site.homepageCollection ?? DEFAULT_HOMEPAGE_COLLECTION;
    return slug === site.homepageSlug && collection === expectedCollection;
  }

  // 2. Convention fallback: slug matches "home" or "index" on a root-prefixed collection
  if (!CONVENTION_SLUGS.includes(slug)) return false;
  // If we know the URL prefix, require it to be "/" (or empty)
  if (collectionUrlPrefix !== undefined) {
    const normalized = collectionUrlPrefix.replace(/\/+$/, "");
    return normalized === "" || normalized === "/";
  }
  // Without url prefix info, accept the default homepage collection name
  return collection === DEFAULT_HOMEPAGE_COLLECTION;
}

/**
 * Resolve the homepage info for a site. Returns null if neither an
 * explicit setting nor a conventional match is found.
 */
export function resolveHomepage(
  site: SiteEntry | null | undefined,
  availableDocs: Array<{ collection: string; slug: string; urlPrefix?: string }>,
): HomepageInfo | null {
  // 1. Explicit setting
  if (site?.homepageSlug) {
    return {
      collection: site.homepageCollection ?? DEFAULT_HOMEPAGE_COLLECTION,
      slug: site.homepageSlug,
      explicit: true,
    };
  }

  // 2. Convention scan: find first doc named "home" or "index" on a "/" collection
  for (const slugName of CONVENTION_SLUGS) {
    const match = availableDocs.find((d) => {
      if (d.slug !== slugName) return false;
      if (d.urlPrefix !== undefined) {
        const normalized = d.urlPrefix.replace(/\/+$/, "");
        return normalized === "" || normalized === "/";
      }
      return d.collection === DEFAULT_HOMEPAGE_COLLECTION;
    });
    if (match) {
      return { collection: match.collection, slug: match.slug, explicit: false };
    }
  }

  return null;
}
