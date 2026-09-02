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
  const doc = xml || "";
  // A <sitemapindex> lists OTHER SITEMAPS, not pages. Parsed as a urlset it
  // yields a non-null set of filenames — so the caller believes it holds the
  // site's path list while it holds zero real pages, and the null-means-
  // "could not look" contract is bypassed. Say so instead.
  if (/<sitemapindex[\s>]/i.test(doc)) return null;

  const paths = new Set<string>();
  for (const m of doc.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      paths.add(normalisePath(new URL(m[1]!).pathname));
    } catch {
      // A malformed <loc> is not a reason to discard the rest of the sitemap.
    }
  }
  return paths.size > 0 ? paths : null;
}

/**
 * One shape for both sides of the comparison.
 *
 * `new URL("https://x.dk/da/næste").pathname` is `/da/n%C3%A6ste`, while a link
 * written in content is raw UTF-8. Compared as-is, no Danish slug containing
 * æ/ø/å ever matched the sitemap — on the very sites this was measured against
 * — and every one of them fell through to a live HTTP probe instead.
 */
export function normalisePath(url: string): string {
  const bare = (url || "").split(/[?#]/)[0]!;
  let decoded = bare;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    // A stray % is not valid encoding; compare the raw form rather than throw.
  }
  return decoded.replace(/\/$/, "") || "/";
}

/**
 * The verdicts that can be reached from an address's SHAPE alone — no network,
 * no path list, no CMS. Returns null when the shape settles nothing and the
 * caller must go and look.
 *
 * It lives here rather than inline in the runner because this is the part that
 * keeps regressing: three separate false-alarm classes in one card (mailto: as
 * a network error, a relative image source as a dead link, an inline data-URI
 * image as "a script that must be removed"), each shipped, each measured only
 * afterwards. The runner cannot be unit-tested — importing it pulls in the CMS
 * — so a rule that stays inside it is a rule nothing can go red on.
 *
 * `kind` is not decoration. The same address means different things in an href
 * and in an <img src>, and every one of the three regressions above was a rule
 * that ignored the difference.
 */
export type ShapeVerdict = { status: "skipped" | "schemeless" | "dangerous"; error?: string };

export function classifyByShape(
  kind: "link" | "image",
  url: string,
  deps: { isSchemeless: (u: string) => boolean; isDangerousUrl: (u: string) => boolean },
): ShapeVerdict | null {
  const v = (url || "").trim();

  // Nothing to fetch. `fetch("mailto:…")` throws, and that surfaced as
  // `error: fetch failed` — 9 of sanneandersen's 37 warnings were a perfectly
  // correct mail address.
  if (isUnfetchable(v)) return { status: "skipped" };

  // An inline image. `data:` is dangerous in an href and completely ordinary
  // in an <img src> — TipTap stores a pasted image as `data:image/png;base64,…`
  // — so this must be settled BEFORE the dangerous check, not after it.
  if (kind === "image" && /^data:/i.test(v)) return { status: "skipped" };

  // javascript:/data:/vbscript:. A scheme, so not schemeless, and not
  // unfetchable, so it used to reach fetch(), throw, and render as a network
  // error — indistinguishable from a timeout, and its opposite.
  //
  // NOT guarded on kind, deliberately, and this was measured: an earlier
  // version carried `kind === "link" &&` here to protect inline data-URI
  // images — but the image case above already returns before this line, so the
  // guard could be deleted with every test still green. A guard nothing can go
  // red on is not protection, it is a claim. The ordering IS the protection,
  // and removing that line does go red. What the unguarded rule now also
  // catches is `<img src="javascript:…">`, which renders nothing in any
  // browser and is worth saying so about.
  if (deps.isDangerousUrl(v)) {
    return {
      status: "dangerous",
      error: "Adressen kan køre kode i browseren. Den bør fjernes — den er ikke et link, den er et script.",
    };
  }

  // No scheme and no leading "/" — the browser resolves it against the page it
  // sits on. Valid markup, dead destination, and nothing looks wrong until
  // someone clicks. LINKS only: a relative image source (`uploads/foto.jpg`)
  // is normal and correct.
  if (kind === "link" && deps.isSchemeless(v)) {
    return {
      status: "schemeless",
      error: "Adressen mangler https:// — en browser læser den som en side på dette site, ikke som en adresse ude på nettet.",
    };
  }

  return null;
}
