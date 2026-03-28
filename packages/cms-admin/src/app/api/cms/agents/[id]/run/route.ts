import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent-runner";
import { denyViewers } from "@/lib/require-role";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await params;
  const { prompt, collection } = (await request.json()) as { prompt?: string; collection?: string };

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const result = await runAgent(id, prompt.trim(), collection?.trim() || undefined);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to run agent";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
