import { NextRequest, NextResponse } from "next/server";
import { getSiteRole } from "@/lib/require-role";
import { readSiteConfig, writeSiteConfig } from "@/lib/site-config";

/**
 * `POST /api/inline-edit/toggle` — body `{ enabled: boolean }`.
 *
 * A narrow, dedicated write endpoint (NOT the full /api/admin/site-config
 * surface) so an editSession bearer token — usable from a site's own /admin
 * page, not just cms-admin — can flip ONE flag without gaining write access
 * to secrets, deploy config, or any other site setting. Admin-only, same as
 * the Site Settings panel itself.
 */
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" },
  });
}

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403, headers: CORS_HEADERS });
  }

  const body = (await request.json().catch(() => null)) as { enabled?: boolean } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400, headers: CORS_HEADERS });
  }

  await writeSiteConfig({ inlineEditEnabled: body.enabled });
  const config = await readSiteConfig();
  return NextResponse.json({ enabled: config.inlineEditEnabled }, { headers: CORS_HEADERS });
}
