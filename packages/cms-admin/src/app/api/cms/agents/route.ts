import { NextRequest, NextResponse } from "next/server";
import { listAgents, createAgent } from "@/lib/agents";
import { denyViewers } from "@/lib/require-role";
import { getServerTSafe } from "@/i18n/server";

export async function GET() {
  const agents = await listAgents();
  return NextResponse.json(agents);
}

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const body = await request.json();
    const agent = await createAgent(body);
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : t("errCms.agents.createFailed");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
