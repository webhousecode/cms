import { NextRequest, NextResponse } from "next/server";
import { getQueueItem, approveQueueItem, rejectQueueItem, updateQueueItemData, pickAlternative } from "@/lib/curation";
import { denyViewers } from "@/lib/require-role";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await getQueueItem(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await params;
  const body = await request.json() as Record<string, unknown>;

  // Field update (inline edit in curation queue)
  if (body.type === "update-fields") {
    const item = await updateQueueItemData(id, body.fields as Record<string, unknown>);
    return NextResponse.json(item);
  }

  // Legacy approve/reject actions
  const { action, feedback } = body as { action?: string; feedback?: string };
  const item = await getQueueItem(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "reject") {
    const updated = await rejectQueueItem(id, feedback ?? "");
    return NextResponse.json(updated);
  }

  if (action === "approve") {
    const updated = await approveQueueItem(id);
    return NextResponse.json(updated);
  }

  if (action === "pick-alternative") {
    const altIndex = (body as { alternativeIndex?: number }).alternativeIndex;
    if (typeof altIndex !== "number") return NextResponse.json({ error: "alternativeIndex required" }, { status: 400 });
    const updated = await pickAlternative(id, altIndex);
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
