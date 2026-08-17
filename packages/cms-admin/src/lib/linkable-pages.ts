/**
 * The pages an editor may link to (F164.5).
 *
 * The list COMES FROM the site's own sitemap. It is not a CMS-derived list that
 * the sitemap validates — that distinction is the whole fix.
 *
 * The first version computed each path from cms.config and got 22 of 156 wrong
 * across two sites, in two different ways that no amount of CMS-side cleverness
 * could have caught:
 *
 *   - sanneandersen: `qigong-classes` documents have slugs because the CMS
 *     requires them, not because they are pages. They render as sections on
 *     /qigong; there is no [slug] route. The computed /qigong/torsdagsholdet
 *     404s while the content sits on the page above it.
 *   - broberg-ai: the route segment itself is translated per locale
 *     (/flagskibe → /flagships) and the English slug's "en-" affix is not in the
 *     URL. Computed /en/flagskibe/en-cms 404s; the real page is
 *     /en/flagships/cms. None of that is expressible in cms.config.
 *
 * The sanne session had already learned this on their own site (their F037) and
 * reported the sharper version of it: a drift-CHECK still leaves two lists to
 * keep in agreement, and it warns only after someone made the wrong one. Asking
 * the site removes the class instead of policing it.
 *
 * The CMS is still used — for TITLES, so the picker is searchable by name. That
 * is enrichment: a title that cannot be matched degrades to one derived from the
 * URL. An address is never invented.
 */

export interface LinkablePage {
  collection: string;
  slug: string;
  title: string;
  path: string;
  label: string;
}

export interface CmsDocIndexEntry {
  collection: string;
  slug: string;
  title: string;
  label: string;
}

/** Extract the `<loc>` values from a sitemap document. */
export function parseSitemapLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) if (m[1]) out.push(m[1]);
  return out;
}

/** Absolute or relative URL → a site-root path, or null if it is not usable. */
export function toPath(loc: string): string | null {
  try {
    const path = loc.startsWith("http") ? new URL(loc).pathname : loc;
    if (!path.startsWith("/")) return null;
    // Strip a trailing slash except for the root itself.
    return path.length > 1 ? path.replace(/\/$/, "") : "/";
  } catch {
    return null;
  }
}

/** "min-lange-side" → "Min lange side" — a readable last resort for a title. */
export function titleFromPath(path: string): string {
  const seg = path.split("/").filter(Boolean).pop();
  if (!seg) return "Forside";
  const words = decodeURIComponent(seg).replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : path;
}

/**
 * Match a sitemap path to a CMS document so the entry can carry a real title.
 *
 * Only the LAST segment is compared, and both locale affix conventions are
 * tried, because a site is free to spell the locale into the slug either way
 * (broberg writes "en-cms", others write "cms-en"). A miss is not a failure —
 * the page still gets listed, just with a title derived from its URL.
 */
export function matchDoc(
  path: string,
  index: Map<string, CmsDocIndexEntry>,
): CmsDocIndexEntry | null {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return null;
  const maybeLocale = segments.length > 1 && /^[a-z]{2}$/.test(segments[0] ?? "") ? segments[0] : null;

  // A localised URL must prefer the localised document, or /en/flagships/cms
  // borrows the DANISH document's title — the bare slug matches both, so it has
  // to be tried last.
  const candidates = maybeLocale
    ? [`${maybeLocale}-${last}`, `${last}-${maybeLocale}`, last]
    : [last];
  for (const key of candidates) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}

/**
 * A CMS field can hold a heading TEMPLATE rather than a display title —
 * sanneandersen's /da/behandlinger matched a field reading "{antal} veje ind —
 * én vej hjem.", which is a placeholder the page fills in at render time. Shown
 * in a link picker it is not a page name, it is a leaked internal. Fall back to
 * the name derived from the URL, which is always something a human can read.
 */
export function isUsableTitle(title: string): boolean {
  return !/\{[^}]*\}/.test(title);
}

export function buildLinkablePages(
  locs: string[],
  index: Map<string, CmsDocIndexEntry>,
): LinkablePage[] {
  const seen = new Set<string>();
  const pages: LinkablePage[] = [];
  for (const loc of locs) {
    const path = toPath(loc);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const doc = matchDoc(path, index);
    const usable = doc && isUsableTitle(doc.title) ? doc : null;
    pages.push({
      collection: doc?.collection ?? "",
      slug: doc?.slug ?? path,
      title: usable ? usable.title : titleFromPath(path),
      path,
      label: doc?.label ?? "Side",
    });
  }
  pages.sort((a, b) => a.title.localeCompare(b.title, "da"));
  return pages;
}
