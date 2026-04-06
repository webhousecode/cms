import { NextRequest, NextResponse } from "next/server";
import { rejectQueueItem, getQueueItem } from "@/lib/curation";
import { getAgent, updateAgent } from "@/lib/agents";
import { denyViewers } from "@/lib/require-role";
import { appendFeedback } from "@/lib/agent-feedback";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await params;
  try {
    const { feedback } = (await request.json()) as { feedback?: string };
    if (!feedback) {
      return NextResponse.json({ error: "feedback required" }, { status: 400 });
    }
    const queueItem = await getQueueItem(id);
    const item = await rejectQueueItem(id, feedback);

    // Increment agent rejected stat + record rejection feedback so the
    // curator's notes feed back into the agent's next run.
    if (queueItem?.agentId) {
      const agent = await getAgent(queueItem.agentId);
      if (agent) {
        await updateAgent(agent.id, {
          stats: { ...agent.stats, rejected: agent.stats.rejected + 1 },
        }).catch(() => {});
      }
      await appendFeedback(queueItem.agentId, {
        type: "rejection",
        queueItemId: queueItem.id,
        notes: feedback,
      }).catch(() => {});
    }

    return NextResponse.json(item);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to reject";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
