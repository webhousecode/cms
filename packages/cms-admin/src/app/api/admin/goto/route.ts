/**
 * POST /api/admin/goto
 * Body: { orgId: string; siteId: string; path: string; label?: string }
 * Returns: { id: string; url: string }
 *
 * Creates a short link that resolves via /admin/goto/[id] with the correct
 * org/site context restored before navigation.
 */
import { NextRequest, NextResponse } from "next/server";
import { createGotoLink } from "@/lib/goto-links";
import { denyViewers } from "@/lib/require-role";
import { getServerTSafe } from "@/i18n/server";

export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const denied = await denyViewers(); if (denied) return denied;
  let body: { orgId?: string; siteId?: string; path?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: t("errAdmin.goto.invalidJson") }, { status: 400 });
  }
  if (!body.orgId || !body.siteId || !body.path) {
    return NextResponse.json(
      { error: t("errAdmin.goto.fieldsRequired") },
      { status: 400 },
    );
  }
  const id = await createGotoLink({
    orgId: body.orgId,
    siteId: body.siteId,
    path: body.path,
    ...(body.label ? { label: body.label } : {}),
  });
  return NextResponse.json({
    id,
    url: `${req.nextUrl.origin}/admin/goto/${id}`,
  });
}
