import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";
import { readSiteConfig } from "@/lib/site-config";
import { loadRegistry } from "@/lib/site-registry";
import { withSiteContext } from "@/lib/site-context";

/**
 * F157 — end the webhouse.app session from a connected site's own /admin.
 *
 * `GET /admin/inline-edit/logout?site=<id>&return=<url>`
 *
 * Why this exists: a site's "Log ud" that only cleared the LOCAL editSession
 * token (localStorage) did not actually log the editor out — the very next
 * /admin visit bounced to the connect flow, the still-valid webhouse.app
 * cms-session silently re-minted a fresh token, and the editor was logged in
 * again (broberg.ai, 2026-07-12). A real logout must kill the cms-session
 * cookie, which only webhouse.app can do on its own origin. A top-level
 * navigation here (SameSite=Lax lets the cookie ride) clears it, then bounces
 * back to the site — now truly logged out (no local token, no session → the
 * connect flow shows the login window instead of re-minting).
 *
 * No permission check: logging YOURSELF out is always allowed. The `return`
 * origin is validated against the site's previewSiteUrl (open-redirect guard),
 * reusing the same source of truth as the connect route.
 */

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("site");
  const returnUrl = request.nextUrl.searchParams.get("return");
  const fallback = request.nextUrl.origin;

  // Always clear the session — even if the site/return params are malformed,
  // logout must succeed. We just fall back to a safe redirect target.
  const clearSession = (res: NextResponse): NextResponse => {
    res.cookies.delete(COOKIE_NAME);
    res.cookies.delete("cms-active-org");
    res.cookies.delete("cms-active-site");
    return res;
  };

  if (!siteId || !returnUrl) {
    return clearSession(NextResponse.redirect(fallback));
  }

  const registry = await loadRegistry();
  let orgId: string | undefined;
  for (const org of registry?.orgs ?? []) {
    if (org.sites.some((s) => s.id === siteId)) {
      orgId = org.id;
      break;
    }
  }
  if (!orgId) {
    return clearSession(NextResponse.redirect(fallback));
  }

  const allowed = await withSiteContext({ orgId, siteId }, async () => {
    const origin = safeOrigin(returnUrl);
    if (!origin) return false;
    try {
      const cfg = await readSiteConfig();
      if (cfg.previewSiteUrl && new URL(cfg.previewSiteUrl).origin === origin) return true;
    } catch {
      /* no site config */
    }
    if (process.env.NODE_ENV !== "production" && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return true;
    }
    return false;
  });

  return clearSession(NextResponse.redirect(allowed ? returnUrl : fallback));
}
