import { NextResponse, type NextRequest } from "next/server";
import { requireToken, isTokenAuth } from "@/lib/require-token";
import { requirePermission } from "@/lib/permissions";
import { getActiveSiteEntry } from "@/lib/site-paths";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { getUserById } from "@/lib/auth";
import { mintEditSessionToken, type EditSessionClaims } from "@/lib/inline-edit-token";
import type { Permission, Resource } from "@/lib/access-tokens";

/**
 * F157 — headless mint of an inline-edit `editSession` token.
 *
 * `POST /api/inline-edit/token?site=<id>`
 *
 * The interactive connect flow (`/admin/inline-edit/connect`) requires a cookie
 * login, so automated verification (Lens) and service callers could never get an
 * edit-capable token headless. This endpoint closes that gap: a caller that
 * ALREADY holds content-edit rights on the target site exchanges them for a
 * short-lived, site-scoped editSession token to drive `?cms_edit=<token>`.
 *
 * Two auth modes, both scoped to the TARGET site (proxy.ts resolves `?site=`):
 *   - Bearer `wh_` access token with `content:write` on `site:<id>` (headless).
 *   - cms-session cookie whose role has `content.edit` on the site (interactive).
 *
 * No privilege escalation: the caller must already be able to edit the site's
 * content, and the minted token can only GET/PATCH `/api/cms/*` (proxy.ts
 * editSession allowlist) — exactly what content-edit rights already permit.
 */
export async function POST(req: NextRequest) {
  const site = await getActiveSiteEntry();
  if (!site) {
    return NextResponse.json({ error: "site not found" }, { status: 404 });
  }

  // Token callers are checked against the token's (permission, resource) grant.
  // Cookie callers fall through here as merely authenticated, so they get the
  // real content.edit role check below.
  const auth = await requireToken(req, "content:write" as Permission, `site:${site.id}` as Resource);
  if (auth instanceof NextResponse) return auth;

  let claims: EditSessionClaims;
  if (isTokenAuth(auth)) {
    // Bearer token: mint on behalf of the token's owner.
    const user = await getUserById(auth.userId);
    if (!user) {
      return NextResponse.json({ error: "token owner not found" }, { status: 401 });
    }
    claims = {
      userId: user.id,
      email: user.email,
      name: user.name ?? user.email,
      role: "editor",
      siteId: site.id,
    };
  } else {
    // Cookie session: require content.edit via role, then mint on their identity.
    const denied = await requirePermission("content.edit");
    if (denied) return denied;
    const session = await getSessionWithSiteRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    claims = {
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.siteRole ?? "editor",
      siteId: site.id,
    };
  }

  const { token, expiresIn } = await mintEditSessionToken(claims);
  return NextResponse.json(
    { token, expiresIn, site: site.id },
    { headers: { "cache-control": "no-store" } },
  );
}
