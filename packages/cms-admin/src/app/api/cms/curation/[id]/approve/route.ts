import { NextRequest, NextResponse } from "next/server";
import { approveQueueItem, getQueueItem } from "@/lib/curation";
import { getAgent, updateAgent } from "@/lib/agents";
import { denyViewers } from "@/lib/require-role";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { asDraft?: boolean };
  try {
    const queueItem = await getQueueItem(id);
    const item = await approveQueueItem(id, body.asDraft ?? false);

    // Increment agent approved stat
    if (queueItem?.agentId) {
      const agent = await getAgent(queueItem.agentId);
      if (agent) {
        await updateAgent(agent.id, {
          stats: { ...agent.stats, approved: agent.stats.approved + 1 },
        }).catch(() => {});
      }
    }

    return NextResponse.json(item);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to approve";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
