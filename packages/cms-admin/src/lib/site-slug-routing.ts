/**
 * F146 — URL-based site routing helpers.
 *
 * Active site lives in the URL path (`/admin/{slug}/...`) instead of only in
 * the `cms-active-site` cookie. proxy.ts resolves the slug, injects the
 * `cms-active-org` + `cms-active-site` cookies on the forwarded request, and
 * rewrites the URL back to `/admin/...` (slug stripped) so the EXISTING route
 * tree renders unchanged. The browser keeps the pretty `/admin/{slug}/` URL.
 *
 * This module is the single source of truth for:
 *   1. which first-segments under /admin are RESERVED (real routes, not slugs)
 *   2. parsing `/admin/{slug}/rest` into { slug, rest }
 *   3. building a slug-prefixed admin path for links (siteAdminPath)
 */

/**
 * First path-segments under /admin that are real routes, NOT site slugs.
 *
 * Derived from the route tree under app/admin/(workspace)/ + (auth)/ + the
 * top-level goto/switch routes. If you add a new top-level admin route, add
 * its segment here (or it will be mistaken for a site slug and rewritten).
 *
 * NOTE: kept as an explicit set rather than a filesystem scan because proxy.ts
 * runs in the edge/middleware runtime where fs is unavailable.
 */
export const RESERVED_ADMIN_SEGMENTS = new Set<string>([
  // (workspace) subroutes
  "account",
  "agents",
  "approve",
  "backup",
  "command",
  "content",
  "curation",
  "deploy",
  "favorites",
  "forms",
  "interactives",
  "lighthouse",
  "link-checker",
  "log",
  "media",
  "organizations",
  "performance",
  "preview",
  "scheduled",
  "seo",
  "settings",
  "sites",
  "trash",
  "visibility",
  // (auth) pages
  "login",
  "signup",
  "setup",
  "invite",
  // top-level admin routes
  "goto",
  "switch",
]);

export interface ParsedSiteSlugPath {
  /** the site slug from the first segment */
  slug: string;
  /** the remaining admin path WITHOUT the slug, always starting with /admin */
  rest: string;
}

/**
 * Parse `/admin/{slug}/rest...` → { slug, rest: "/admin/rest..." }.
 *
 * Returns null when the path is not a slug-prefixed admin path — i.e. when:
 *   - it isn't under /admin
 *   - it's bare /admin or /admin/
 *   - the first segment is a RESERVED route (content, settings, …)
 *
 * The caller still has to confirm `slug` is a real registry site before
 * acting; an unknown slug should fall through to normal routing (404).
 */
export function parseSiteSlugPath(pathname: string): ParsedSiteSlugPath | null {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return null;
  const segments = pathname.split("/").filter(Boolean); // ["admin", slug, ...rest]
  if (segments.length < 2) return null; // bare /admin
  const slug = segments[1];
  if (RESERVED_ADMIN_SEGMENTS.has(slug)) return null;
  const rest = segments.slice(2).join("/");
  return { slug, rest: rest ? `/admin/${rest}` : "/admin" };
}

/**
 * Build a slug-prefixed admin URL for a link.
 *
 *   siteAdminPath("/admin/content/posts", "trail") → "/admin/trail/content/posts"
 *   siteAdminPath("/admin", "trail")               → "/admin/trail"
 *
 * Paths that are not under /admin, or are already slug-prefixed, are returned
 * unchanged. When `slug` is falsy the original path is returned (cookie
 * fallback still resolves the site).
 */
export function siteAdminPath(adminPath: string, slug: string | null | undefined): string {
  if (!slug) return adminPath;
  if (adminPath !== "/admin" && !adminPath.startsWith("/admin/")) return adminPath;
  // already slug-prefixed?
  const existing = parseSiteSlugPath(adminPath);
  if (existing) return adminPath;
  const rest = adminPath.slice("/admin".length); // "" or "/content/posts"
  return `/admin/${slug}${rest}`;
}
