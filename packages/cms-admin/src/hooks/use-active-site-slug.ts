"use client";

import { usePathname } from "next/navigation";
import { parseSiteSlugPath, siteAdminPath } from "@/lib/site-slug-routing";

/**
 * F146 — read the active site slug from the current URL.
 *
 * After F146 the admin URL is `/admin/{slug}/...`. This hook extracts that
 * slug so client links can stay slug-prefixed (keeping the pretty URL on
 * click-navigation). Returns null when the URL has no slug (bare `/admin/...`,
 * e.g. before the user has navigated into a site) — in that case links fall
 * back to unscoped `/admin/...` paths, which the proxy still resolves via the
 * cookie. So a null slug is never broken, just not URL-scoped.
 */
export function useActiveSiteSlug(): string | null {
  const pathname = usePathname();
  if (!pathname) return null;
  return parseSiteSlugPath(pathname)?.slug ?? null;
}

/**
 * Convenience: returns a `link(path)` function that slug-prefixes an admin
 * path with the active slug. `link("/admin/content/posts")` →
 * `/admin/{slug}/content/posts` (or the path unchanged when no slug).
 */
export function useSiteLink(): (adminPath: string) => string {
  const slug = useActiveSiteSlug();
  return (adminPath: string) => siteAdminPath(adminPath, slug);
}
