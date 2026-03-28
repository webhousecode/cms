import { NextRequest, NextResponse } from "next/server";
import { getAgent, createAgent } from "@/lib/agents";
import { denyViewers } from "@/lib/require-role";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await params;
  const original = await getAgent(id);
  if (!original) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { id: _id, createdAt: _ca, updatedAt: _ua, stats: _stats, ...rest } = original;
  const cloned = await createAgent({
    ...rest,
    name: `Copy of ${original.name}`,
    active: false,
  });

  return NextResponse.json(cloned);
}
