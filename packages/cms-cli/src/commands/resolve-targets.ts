/**
 * F162.10 — shared page-source resolver for `cms coverage` + `cms check-editable`.
 *
 * The RIGHT way to tell the gates which pages to check is to let the SITE own its
 * own page list: point `--sitemap <url>` at the site's sitemap.xml and the gate
 * discovers every real URL itself. No hand-maintained `--pages` list (which is
 * how phantom/duplicate slugs crept in) and no way to silently miss a page the
 * site actually serves. `--pages` stays as a manual override / escape hatch.
 */

export interface TargetOptions {
  /** Base URL of a running/served site (used with --pages). */
  url?: string;
  /** Comma-separated page paths (manual list / override). */
  pages?: string;
  /** URL of the site's sitemap.xml — the preferred, self-maintaining source. */
  sitemap?: string;
}

export interface Target {
  /** Human label (the path) for reporting. */
  label: string;
  /** Absolute URL to fetch. */
  url: string;
}

/** Extract every `<loc>` URL from a sitemap.xml body (flat urlset or index). */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.trim());
}

/**
 * Resolve the concrete list of pages to scan. `--sitemap` wins: it fetches the
 * site's sitemap and returns every URL. Otherwise falls back to `--url` + `--pages`.
 * A sitemap that is an <index> of other sitemaps is followed one level deep.
 */
export async function resolveTargets(opts: TargetOptions): Promise<Target[]> {
  if (opts.sitemap) {
    const locs = await loadSitemap(opts.sitemap);
    // A sitemap index points at child sitemaps (they end in .xml and contain no
    // page content) — follow one level so `/sitemap.xml` → child → pages works.
    const looksLikeIndex = locs.length > 0 && locs.every((u) => /sitemap.*\.xml($|\?)/i.test(u));
    const pageUrls = looksLikeIndex
      ? (await Promise.all(locs.map((u) => loadSitemap(u)))).flat()
      : locs;
    const seen = new Set<string>();
    const targets: Target[] = [];
    for (const u of pageUrls) {
      if (seen.has(u)) continue;
      seen.add(u);
      let label = u;
      try {
        label = new URL(u).pathname;
      } catch {
        /* keep full URL as label */
      }
      targets.push({ label, url: u });
    }
    return targets;
  }

  const base = (opts.url ?? '').replace(/\/$/, '');
  const paths = (opts.pages ?? '/')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return paths.map((p) => ({
    label: p,
    url: base + (p.startsWith('/') ? p : `/${p}`),
  }));
}

async function loadSitemap(sitemapUrl: string): Promise<string[]> {
  const res = await fetch(sitemapUrl, { headers: { 'user-agent': 'cms-cli' } });
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status} ${sitemapUrl}`);
  return parseSitemapLocs(await res.text());
}
