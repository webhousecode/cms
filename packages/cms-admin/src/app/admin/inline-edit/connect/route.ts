import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { requirePermission } from "@/lib/permissions";
import { getActiveSiteEntry } from "@/lib/site-paths";
import { getSessionWithSiteRole } from "@/lib/require-role";

/**
 * F157 (site-wide) — "Log ind for at redigere" connect flow.
 *
 * `GET /admin/inline-edit/connect?site=<id>&return=<url>`
 * - Lives under /admin so proxy.ts's existing auth gate applies for free —
 *   an unauthenticated visitor is redirected to /admin/login first, then
 *   lands back here after signing in (Next.js `from` param round-trip).
 * - Gated by `content.edit` on the given site.
 * - Mints a 30-day, site-scoped (not per-document) editSession token, then
 *   redirects the browser back to `return` with `?cms_edit=<token>` appended.
 *   The live site's client (@broberg/cms-inline-edit) captures it into
 *   localStorage so every future page load on that site is already
 *   connected — no repeat visits to cms-admin required.
 */

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production",
  );
}

export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("site");
  const returnUrl = request.nextUrl.searchParams.get("return");
  if (!siteId || !returnUrl) {
    return NextResponse.json({ error: "site and return are required" }, { status: 400 });
  }

  const denied = await requirePermission("content.edit");
  if (denied) return denied;

  const site = await getActiveSiteEntry();
  if (!site || site.id !== siteId) {
    return NextResponse.json({ error: "Active site does not match ?site=" }, { status: 400 });
  }

  const session = await getSessionWithSiteRole();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const expires = now + TTL_SECONDS;
  const token = await new SignJWT({
    sub: session.userId,
    email: session.email,
    name: session.name,
    role: session.siteRole ?? "editor",
    editSession: true,
    site: site.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(expires)
    .sign(getJwtSecret());

  const target = new URL(returnUrl);
  target.searchParams.set("cms_edit", token);
  return NextResponse.redirect(target.toString());
}
