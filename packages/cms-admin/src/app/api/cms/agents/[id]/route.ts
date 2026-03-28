import { NextRequest, NextResponse } from "next/server";
import { getAgent, updateAgent, deleteAgent } from "@/lib/agents";
import { denyViewers } from "@/lib/require-role";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(agent);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await params;
  try {
    const body = await request.json();
    const agent = await updateAgent(id, body);
    return NextResponse.json(agent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update agent";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await params;
  try {
    await deleteAgent(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete agent";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
