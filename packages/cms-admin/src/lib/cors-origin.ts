/**
 * Shared CORS origin matcher for the cross-origin browser routes (inline-edit
 * GET/PATCH, form submissions). Both used to inline `allowed.some(a => origin === a)`
 * — an EXACT string compare that silently failed whenever a site's
 * `previewSiteUrl` carried a trailing slash or a path (e.g.
 * "https://site.fly.dev/"), because a browser's `Origin` header is ALWAYS just
 * scheme+host+port with no trailing slash. The mismatch dropped the
 * `Access-Control-Allow-Origin` header → the browser blocked the request →
 * the inline-edit save showed a red "Fejl" pill (2026-07-12, sanneandersen).
 *
 * Compare by URL origin so a trailing slash / path in the allowed entry no
 * longer breaks the match. Falls back to exact equality for "*" or a malformed
 * entry (never throws).
 */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.some((a) => {
    if (a === "*" || a === origin) return true;
    try {
      return new URL(a).origin === origin;
    } catch {
      return false;
    }
  });
}

/**
 * The hosts a site legitimately answers on, as browser origins.
 *
 * This used to be `previewSiteUrl` alone, inline in the route. The day
 * webhouse.dk was pointed at the site and previewSiteUrl moved with it, every
 * inline-edit save from the staging address stopped working: the response
 * carried no `Access-Control-Allow-Origin`, the browser dropped it, and the
 * editor saw a red pill with nothing in any log. A site having both a staging
 * address and a live domain is normal, so all of its own configured hosts
 * count — this widens nothing beyond the tenant.
 *
 * `deployCustomDomain` is stored as a BARE host ("wh-site.webhouse.net"). An
 * Origin header never is, and originAllowed() parses each entry as a URL, so a
 * bare host would silently match nothing. Scheme is added here, once.
 */
export function siteOrigins(config: {
  previewSiteUrl?: string;
  deployProductionUrl?: string;
  deployCustomDomain?: string;
  siteDomains?: string[];
}): string[] {
  const out: string[] = [];
  // siteDomains is the EXPLICIT list an operator maintains (F157.13); the other
  // three are hosts the site happens to have for other reasons.
  for (const raw of [
    ...(config.siteDomains ?? []),
    config.previewSiteUrl,
    config.deployProductionUrl,
    config.deployCustomDomain,
  ]) {
    const v = raw?.trim();
    if (!v) continue;
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    if (!out.includes(withScheme)) out.push(withScheme);
  }
  return out;
}

/**
 * The www./apex sibling of a host, or null when there is none to add.
 *
 * A site that redirects www → apex (or the reverse) otherwise works or fails
 * depending on which form the editor happened to type — and the browser's
 * Origin header carries whichever one they landed on. Deliberately narrow: ONLY
 * the literal "www." prefix on a host that is already allowed. It never reaches
 * a different registrable domain and never allows an arbitrary subdomain.
 */
function wwwSibling(origin: string): string | null {
  try {
    const u = new URL(origin);
    if (u.hostname.startsWith("www.")) {
      u.hostname = u.hostname.slice(4);
    } else {
      // Only pair a bare registrable-looking host (one dot) with its www form;
      // "app.example.com" has no www sibling worth inventing.
      if (u.hostname.split(".").length !== 2) return null;
      u.hostname = `www.${u.hostname}`;
    }
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Every origin a site legitimately answers on, INCLUDING www./apex siblings.
 *
 * Use this — not siteOrigins() — for any gate a browser hits, so a site keeps
 * working the day its domain changes. Measured on sanneandersen.dk's launch day
 * (2026-08-26): the site moved from its fly.dev address to the real domain and
 * three separate gates still read `previewSiteUrl` alone, so inline editing
 * refused the new domain outright and the contact form would have refused every
 * submission from it — silently, and nobody had reported that half.
 */
export function siteOriginsWithSiblings(config: {
  previewSiteUrl?: string;
  deployProductionUrl?: string;
  deployCustomDomain?: string;
  siteDomains?: string[];
}): string[] {
  const out = siteOrigins(config).map((o) => {
    try {
      return new URL(o).origin;
    } catch {
      return o;
    }
  });
  for (const o of [...out]) {
    const sib = wwwSibling(o);
    if (sib && !out.includes(sib)) out.push(sib);
  }
  return out;
}

/**
 * Normalise one operator-entered domain to a browser origin, or explain why it
 * cannot be one.
 *
 * Rejects rather than silently dropping: a domain someone typed and saw
 * disappear teaches nothing, and a domain silently accepted in a form that
 * never matches an Origin header is worse — it looks configured and is not.
 *
 * - wildcards are not origins; a browser never sends one
 * - a path is never part of an Origin header, so "example.dk/shop" would match
 *   nothing while reading as if it did
 * - a bare host is the normal way a person writes one, so it gets https://
 */
export function normalizeDomainEntry(raw: string): { origin: string } | { error: string } {
  const v = (raw ?? "").trim();
  if (!v) return { error: "Domænet er tomt" };
  if (v.includes("*")) return { error: `Wildcards kan ikke bruges som domæne: "${v}"` };

  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { error: `Ikke et gyldigt domæne: "${v}"` };
  }
  if (!u.hostname || !u.hostname.includes(".")) {
    return { error: `Ikke et gyldigt domæne: "${v}"` };
  }
  // A trailing "/" is what a browser's address bar gives you, so accept it —
  // anything more is a path and would never match an Origin header.
  if (u.pathname !== "/" || u.search || u.hash) {
    return { error: `Et domæne kan ikke indeholde en sti: "${v}"` };
  }
  return { origin: u.origin };
}

/**
 * Normalise a whole list, keeping the first spelling of each origin.
 *
 * "example.dk" and "https://example.dk/" are the same host written two ways;
 * storing both would show an operator two entries that do the same thing.
 */
export function normalizeDomainList(
  raw: string[],
): { domains: string[] } | { error: string } {
  const out: string[] = [];
  for (const entry of raw) {
    const r = normalizeDomainEntry(entry);
    if ("error" in r) return { error: r.error };
    if (!out.includes(r.origin)) out.push(r.origin);
  }
  return { domains: out };
}
