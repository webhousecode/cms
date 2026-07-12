import { NextResponse } from "next/server";
import { getSiteRole, getSessionWithSiteRole } from "@/lib/require-role";
import { hasPermission, ROLE_PERMISSIONS } from "@/lib/permissions";
import { getActiveSiteEntry } from "@/lib/site-paths";
import { mintEditSessionToken } from "@/lib/inline-edit-token";

/**
 * F157 — headless mint of an inline-edit `editSession` token.
 *
 * `POST /api/inline-edit/token?site=<id>`
 *
 * The interactive connect flow (`/admin/inline-edit/connect`) requires a cookie
 * login, so automated verification (Lens) and service callers could never get an
 * edit-capable token headless. This endpoint closes that gap: a caller that can
 * already edit the target site's content exchanges that right for a short-lived,
 * site-scoped editSession token to drive `?cms_edit=<token>`.
 *
 * Auth follows the proven site-write pattern (same as `/api/inline-edit/toggle`):
 * proxy.ts resolves `?site=` AND converts a `wh_` Bearer / `X-CMS-Service-Token`
 * into a cms-session cookie, so `getSiteRole()` reads the right identity for BOTH
 * a browser editor and a headless token caller. We require `content.edit` (not
 * admin) so editors can mint their own edit token.
 *
 * No privilege escalation: the caller must already hold content.edit on the site,
 * and the minted token can only GET/PATCH `/api/cms/*` (proxy.ts editSession
 * allowlist) — exactly what content.edit already permits.
 */
export async function POST() {
  const role = await getSiteRole();
  if (!role || !hasPermission(ROLE_PERMISSIONS[role] ?? [], "content.edit")) {
    return NextResponse.json({ error: "Forbidden — content.edit required" }, { status: 403 });
  }

  const site = await getActiveSiteEntry();
  if (!site) {
    return NextResponse.json({ error: "site not found" }, { status: 404 });
  }

  const session = await getSessionWithSiteRole();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token, expiresIn } = await mintEditSessionToken({
    userId: session.userId,
    email: session.email,
    name: session.name,
    role: session.siteRole ?? role,
    siteId: site.id,
  });

  return NextResponse.json(
    { token, expiresIn, site: site.id },
    { headers: { "cache-control": "no-store" } },
  );
}
