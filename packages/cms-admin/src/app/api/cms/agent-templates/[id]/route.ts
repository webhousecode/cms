/**
 * Single agent template — fetch or delete a local template by id.
 *
 * GET    /api/cms/agent-templates/[id] → fetch one local template
 * DELETE /api/cms/agent-templates/[id] → remove it
 */
import { NextRequest, NextResponse } from "next/server";
import { getLocalTemplate, updateLocalTemplate, deleteLocalTemplate } from "@/lib/agent-templates";
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyViewers();
  if (denied) return denied;
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ error: "No active org" }, { status: 400 });
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Body required" }, { status: 400 });

  // Strip fields the caller is never allowed to set on update
  delete body.id;
  delete body.createdAt;
  delete body.source;

  try {
    const updated = await updateLocalTemplate(orgId, id, body as never);
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update template";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
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
