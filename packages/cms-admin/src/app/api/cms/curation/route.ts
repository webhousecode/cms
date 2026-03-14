import { NextRequest, NextResponse } from "next/server";
import { listQueueItems, getQueueStats, purgeExpiredQueueItems } from "@/lib/curation";
import { readSiteConfig } from "@/lib/site-config";
import type { QueueItem } from "@/lib/curation";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as QueueItem["status"] | null;
  const statsOnly = searchParams.get("stats");

  // Auto-purge expired items on every request (cheap JSON filter)
  const siteConfig = await readSiteConfig();
  await purgeExpiredQueueItems(siteConfig.curationRetentionDays).catch(() => {});

  if (statsOnly === "true") {
    const stats = await getQueueStats();
    return NextResponse.json(stats);
  }

  const items = await listQueueItems(status ?? undefined);
  return NextResponse.json(items);
}
