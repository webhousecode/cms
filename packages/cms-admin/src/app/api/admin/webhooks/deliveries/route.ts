/**
 * GET /api/admin/webhooks/deliveries — Read webhook delivery log.
 *
 * Returns the most recent webhook deliveries from
 * _data/webhook-deliveries.jsonl (rolling 500 entries).
 *
 * Query params:
 *   - limit: number (default 100, max 500)
 *   - event: string (filter by event name, e.g. "content.published")
 */
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { getActiveSitePaths } from "@/lib/site-paths";
import { denyViewers } from "@/lib/require-role";

interface DeliveryLogEntry {
  timestamp: string;
  deliveryId?: string;
  webhookId?: string;
  event: string;
  title?: string;
  webhookUrl: string;
  success: boolean;
  statusCode?: number;
  attempts?: number;
  error?: string;
}

export async function GET(request: NextRequest) {
  const denied = await denyViewers();
  if (denied) return denied;

  try {
    const { dataDir } = await getActiveSitePaths();
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10), 500);
    const eventFilter = request.nextUrl.searchParams.get("event");

    const fs = await import("node:fs/promises");
    let deliveries: DeliveryLogEntry[] = [];

    // Try the F35 log first, fall back to legacy notification-log
    for (const filename of ["webhook-deliveries.jsonl", "notification-log.jsonl"]) {
      const logPath = path.join(dataDir, filename);
      try {
        const content = await fs.readFile(logPath, "utf-8");
        deliveries = content
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            try { return JSON.parse(line) as DeliveryLogEntry; } catch { return null; }
          })
          .filter((d): d is DeliveryLogEntry => d !== null);
        if (deliveries.length > 0) break;
      } catch {
        /* file doesn't exist yet */
      }
    }

    // Newest first
    deliveries.reverse();

    if (eventFilter) {
      deliveries = deliveries.filter((d) => d.event === eventFilter);
    }

    return NextResponse.json({
      deliveries: deliveries.slice(0, limit),
      total: deliveries.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read deliveries";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
