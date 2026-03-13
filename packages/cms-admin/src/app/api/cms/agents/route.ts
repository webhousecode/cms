import { NextRequest, NextResponse } from "next/server";
import { listAgents, createAgent } from "@/lib/agents";

export async function GET() {
  const agents = await listAgents();
  return NextResponse.json(agents);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const agent = await createAgent(body);
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create agent";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
