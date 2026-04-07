/**
 * Trigger a workflow run.
 *
 * POST /api/cms/workflows/[id]/run
 * Body: { prompt: string }
 *
 * Synchronous: blocks until the whole pipeline finishes (could be 1-2
 * minutes for a 3-step workflow). Returns the WorkflowRunResult with
 * the queueItemId so the curator can jump straight to the resulting
 * draft.
 */
import { NextRequest, NextResponse } from "next/server";
import { runWorkflow } from "@/lib/workflow-runner";
import { denyViewers } from "@/lib/require-role";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyViewers();
  if (denied) return denied;
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { prompt?: string };
  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const result = await runWorkflow(id, body.prompt.trim());
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to run workflow";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
