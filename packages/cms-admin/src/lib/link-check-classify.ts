/**
 * The pure decisions the link checker makes before it touches the network.
 *
 * Lifted out of the runner so they can be tested without a CMS or a fetch —
 * and because each of them was, until F183, a class of FALSE alarm. Measured
 * on sanneandersen: 17 of 37 warnings were the tool's own, and a tool where
 * nearly half the warnings are wrong is one people stop reading. That is worse
 * than silence: the one real dead link (a legal reference in the terms page)
 * was sitting in the same list.
 */

/**
 * An address there is nothing to fetch.
 *
 * `fetch("mailto:…")` throws, and the runner reported that as
 * `error: fetch failed` — nine warnings on sanneandersen, every one of them a
 * perfectly correct mail address.
 */
export function isUnfetchable(url: string): boolean {
  return /^(mailto|tel|sms|callto|fax|geo|bitcoin|magnet):/i.test((url || "").trim());
}

/**
 * Every path in a sitemap.xml.
 *
 * The site's OWN list. The runner's other list is derived from CMS documents,
 * so it cannot contain a static route and reports a live page as dead — the
 * same shape as sanneandersen's F054.1, where a derived list shipped 47 of 130
 * pages. A derived list is not partly wrong; it is incomplete, and nothing on
 * it says by how much.
 *
 * Returns null when the document yields nothing usable, so the caller can say
 * "not verified" rather than "fine" — a check that could not look must never
 * report a clean result.
 */
export function sitemapPathsFromXml(xml: string): Set<string> | null {
  const paths = new Set<string>();
  for (const m of (xml || "").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      paths.add(new URL(m[1]!).pathname.replace(/\/$/, "") || "/");
    } catch {
      // A malformed <loc> is not a reason to discard the rest of the sitemap.
    }
  }
  return paths.size > 0 ? paths : null;
}

/** Compare a link's path against the sitemap the way a browser would. */
export function normalisePath(url: string): string {
  return (url || "").split(/[?#]/)[0]!.replace(/\/$/, "") || "/";
}
