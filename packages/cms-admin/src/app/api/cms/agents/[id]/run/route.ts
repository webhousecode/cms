import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent-runner";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { prompt } = (await request.json()) as { prompt?: string };

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const result = await runAgent(id, prompt.trim());
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to run agent";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
