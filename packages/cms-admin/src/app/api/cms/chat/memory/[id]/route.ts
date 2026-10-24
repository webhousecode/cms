import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { requirePermission } from "@/lib/permissions";
import { deleteMemory, updateMemory } from "@/lib/chat/memory-store";
import { getServerTSafe } from "@/i18n/server";

/** DELETE /api/cms/chat/memory/[id] — delete a memory */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getServerTSafe();
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: t("errCms.shared.noAccess") }, { status: 403 });
  // Security W43 NY-HØJ-B — memories are injected into the site chat agent's
  // system prompt; reading or writing them is chat use, not mere membership.
  { const denied = await requirePermission("chat.use"); if (denied) return denied; }

  const { id } = await params;
  const deleted = await deleteMemory(id);
  if (!deleted) {
    return NextResponse.json({ error: t("errCms.shared.memoryNotFound") }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** PATCH /api/cms/chat/memory/[id] — update a memory */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getServerTSafe();
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: t("errCms.shared.noAccess") }, { status: 403 });
  // Security W43 NY-HØJ-B — memories are injected into the site chat agent's
  // system prompt; reading or writing them is chat use, not mere membership.
  { const denied = await requirePermission("chat.use"); if (denied) return denied; }

  const { id } = await params;
  const body = await request.json();
  const updated = await updateMemory(id, body);
  if (!updated) {
    return NextResponse.json({ error: t("errCms.shared.memoryNotFound") }, { status: 404 });
  }
  return NextResponse.json({ memory: updated });
}
