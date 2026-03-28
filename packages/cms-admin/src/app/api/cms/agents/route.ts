import { NextRequest, NextResponse } from "next/server";
import { listAgents, createAgent } from "@/lib/agents";
import { denyViewers } from "@/lib/require-role";

export async function GET() {
  const agents = await listAgents();
  return NextResponse.json(agents);
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const body = await request.json();
    const agent = await createAgent(body);
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create agent";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
