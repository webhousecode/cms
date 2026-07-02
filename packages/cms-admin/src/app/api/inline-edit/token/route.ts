import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { requirePermission } from "@/lib/permissions";
import { getActiveSiteEntry } from "@/lib/site-paths";
import { getSessionWithSiteRole } from "@/lib/require-role";

/**
 * F157.1 — Inline-edit session token mint endpoint.
 *
 * `POST /api/inline-edit/token`
 * - Auth: existing `cms-session` cookie (already-authenticated cms-admin user),
 *   gated by `content.edit` on the active site. NOT a static shared secret —
 *   every mint is tied to the calling user's own session.
 * - Mints a short-lived (10 min), purpose-tagged JWT scoped to `site` + one
 *   `collection`. proxy.ts enforces a hard allowlist on `editSession: true`
 *   tokens (F157.2) — the scope here is necessary but not the whole boundary.
 * - Consumed by the "Redigér live" button (F157.2), which opens the live site
 *   with `?cms_edit=<token>` appended.
 */

const TTL_SECONDS = 600; // 10 minutes

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production",
  );
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission("content.edit");
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { collection?: string } | null;
  const collection = body?.collection;
  if (!collection || typeof collection !== "string") {
    return NextResponse.json({ error: "collection is required" }, { status: 400 });
  }

  const site = await getActiveSiteEntry();
  if (!site) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
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
    collection,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(expires)
    .sign(getJwtSecret());

  return NextResponse.json({ token, expiresAt: expires * 1000 });
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
