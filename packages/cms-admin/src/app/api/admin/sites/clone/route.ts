/**
 * POST /api/admin/sites/clone — Clone a filesystem-backed site.
 *
 * Body: { sourceSiteId, newName, targetOrgId? }
 *
 * Creates a complete copy of the source site's content, media, config,
 * and _data (with secrets stripped). Registers the new site in the
 * target org (defaults to source's org).
 *
 * Auth: admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";
import { cloneSite } from "@/lib/site-clone";

export async function POST(request: NextRequest) {
  // Admin-only
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const members = await getTeamMembers();
  const membership = members.find((m) => m.userId === session.sub);
  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      sourceSiteId?: string;
      newName?: string;
      targetOrgId?: string;
    };

    if (!body.sourceSiteId || !body.newName) {
      return NextResponse.json(
        { error: "sourceSiteId and newName required" },
        { status: 400 },
      );
    }

    const result = await cloneSite({
      sourceSiteId: body.sourceSiteId,
      newName: body.newName,
      targetOrgId: body.targetOrgId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Clone failed";
    console.error("[sites/clone]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
