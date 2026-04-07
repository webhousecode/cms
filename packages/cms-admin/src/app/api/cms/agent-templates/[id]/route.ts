/**
 * Single agent template — fetch or delete a local template by id.
 *
 * GET    /api/cms/agent-templates/[id] → fetch one local template
 * DELETE /api/cms/agent-templates/[id] → remove it
 */
import { NextRequest, NextResponse } from "next/server";
import { getLocalTemplate, deleteLocalTemplate } from "@/lib/agent-templates";
import { denyViewers } from "@/lib/require-role";
import { cookies } from "next/headers";

async function getActiveOrgId(): Promise<string | null> {
  try {
    const c = await cookies();
    return c.get("cms-active-org")?.value ?? null;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ error: "No active org" }, { status: 400 });
  const { id } = await params;
  const template = await getLocalTemplate(orgId, id);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyViewers();
  if (denied) return denied;
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ error: "No active org" }, { status: 400 });
  const { id } = await params;
  try {
    await deleteLocalTemplate(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
