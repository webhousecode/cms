import { NextRequest, NextResponse } from "next/server";
import { listQueueItems, getQueueStats } from "@/lib/curation";
import type { QueueItem } from "@/lib/curation";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as QueueItem["status"] | null;
  const statsOnly = searchParams.get("stats");

  if (statsOnly === "true") {
    const stats = await getQueueStats();
    return NextResponse.json(stats);
  }

  const items = await listQueueItems(status ?? undefined);
  return NextResponse.json(items);
}
