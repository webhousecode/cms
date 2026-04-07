/**
 * Single workflow endpoint.
 *
 * GET    /api/cms/workflows/[id] → fetch one workflow
 * PUT    /api/cms/workflows/[id] → update fields
 * DELETE /api/cms/workflows/[id] → remove permanently
 */
import { NextRequest, NextResponse } from "next/server";
import { getWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/agent-workflows";
import { denyViewers } from "@/lib/require-role";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const workflow = await getWorkflow(id);
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(workflow);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyViewers();
  if (denied) return denied;
  const { id } = await params;
  try {
    const body = await request.json();
    const updated = await updateWorkflow(id, body);
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update workflow";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyViewers();
  if (denied) return denied;
  const { id } = await params;
  try {
    await deleteWorkflow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
