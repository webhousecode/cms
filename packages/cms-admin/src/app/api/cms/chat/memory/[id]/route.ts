import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { deleteMemory, updateMemory } from "@/lib/chat/memory-store";

/** DELETE /api/cms/chat/memory/[id] — delete a memory */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const { id } = await params;
  const deleted = await deleteMemory(id);
  if (!deleted) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** PATCH /api/cms/chat/memory/[id] — update a memory */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const updated = await updateMemory(id, body);
  if (!updated) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }
  return NextResponse.json({ memory: updated });
}
