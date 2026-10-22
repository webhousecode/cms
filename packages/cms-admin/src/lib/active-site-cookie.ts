/**
 * Security W41 C1 — the cms-active-org / cms-active-site cookies are chosen by
 * the BROWSER, and several libraries build file paths from them
 * (org-settings: `<data>/org-settings/<org>.json`). `cms-active-org=../users`
 * therefore pointed org-settings at `_data/users.json`.
 *
 * The proxy now forwards only a pair that EXISTS in the registry, so no
 * downstream reader ever sees an id that was not created by the CMS itself.
 * Membership is still each route's job (getSiteRole / requirePermission) —
 * this closes the traversal and the "unknown tenant" class, not authorisation.
 */
import type { Registry } from "./site-registry";

const ORG = "cms-active-org";
const SITE = "cms-active-site";

/** Ids the CMS itself creates: lowercase slug characters, never a dot or slash. */
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,99}$/;

export function isSafeId(v: unknown): v is string {
  return typeof v === "string" && SAFE_ID.test(v);
}

/**
 * Rewrite a Cookie header so it carries at most ONE cms-active-org and ONE
 * cms-active-site, and only values that name a real org / a site of that org.
 * The LAST occurrence wins: proxy-injected values are appended after the
 * browser's own. Without a registry (single-site mode) only the id shape is
 * checked.
 */
export function sanitizeActiveSiteCookies(cookieHeader: string, registry: Registry | null): string {
  if (!cookieHeader) return "";
  const parts = cookieHeader.split(/;\s*/).filter(Boolean);
  let org: string | undefined;
  let site: string | undefined;
  const rest: string[] = [];
  for (const p of parts) {
    const eq = p.indexOf("=");
    const name = (eq === -1 ? p : p.slice(0, eq)).trim();
    const value = eq === -1 ? "" : p.slice(eq + 1).trim();
    if (name === ORG) org = value;
    else if (name === SITE) site = value;
    else rest.push(p);
  }

  let keepOrg = isSafeId(org) ? org : undefined;
  let keepSite = keepOrg && isSafeId(site) ? site : undefined;
  if (registry && keepOrg) {
    const o = registry.orgs.find((x) => x.id === keepOrg);
    if (!o) keepOrg = keepSite = undefined;
    else if (keepSite && !o.sites.some((s) => s.id === keepSite)) keepSite = undefined;
  }

  if (keepOrg) rest.push(`${ORG}=${keepOrg}`);
  if (keepSite) rest.push(`${SITE}=${keepSite}`);
  return rest.join("; ");
}
