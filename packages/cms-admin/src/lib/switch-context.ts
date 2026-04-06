/**
 * Single source of truth for org/site switching.
 *
 * ALL org and site switches MUST go through these functions.
 * Never set cms-active-org / cms-active-site cookies directly.
 * Never use router.push() for context switches — only window.location.href.
 *
 * These functions:
 * 1. Set cookies (client-side, immediate)
 * 2. Signal TabsProvider to start fresh (sessionStorage flag)
 * 3. Persist choice on user profile (async, fire-and-forget)
 * 4. Hard-navigate via window.location.href (bypasses Next.js Router Cache)
 */

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=;path=/;max-age=0`;
}

function persistProfile(orgId: string, siteId: string | null) {
  fetch("/api/admin/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lastActiveOrg: orgId, lastActiveSite: siteId }),
  }).catch(() => {});
}

/**
 * Switch to a different site within the current or specified org.
 * Navigates to /admin (dashboard) via hard reload.
 */
export function switchSite(siteId: string, orgId: string, destination = "/admin") {
  setCookie("cms-active-site", siteId);
  setCookie("cms-active-org", orgId);
  sessionStorage.setItem("site-switched", "1");
  persistProfile(orgId, siteId);
  window.location.href = destination;
}

/**
 * Switch to a different org. Sets the first site as active.
 * Navigates to /admin/sites (multi-site) or /admin (single site) via hard reload,
 * unless `destination` is specified.
 */
export function switchOrg(
  orgId: string,
  firstSiteId: string | null,
  siteCount: number,
  destination?: string,
) {
  setCookie("cms-active-org", orgId);
  if (firstSiteId) {
    setCookie("cms-active-site", firstSiteId);
  } else {
    clearCookie("cms-active-site");
  }
  sessionStorage.setItem("org-switched", "1");
  persistProfile(orgId, firstSiteId);
  window.location.href = destination ?? (siteCount <= 1 ? "/admin" : "/admin/sites");
}

/**
 * Switch to a newly created org (no sites yet).
 * Navigates to /admin/sites/new.
 */
export function switchToNewOrg(orgId: string) {
  setCookie("cms-active-org", orgId);
  clearCookie("cms-active-site");
  sessionStorage.setItem("org-switched", "1");
  persistProfile(orgId, null);
  window.location.href = "/admin/sites/new";
}
