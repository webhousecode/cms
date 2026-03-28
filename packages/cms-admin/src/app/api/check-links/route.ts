import { NextRequest, NextResponse } from "next/server";
import { runLinkCheck, type LinkResult } from "@/lib/link-check-runner";
import { writeLinkCheckResult } from "@/lib/link-check-store";
import { denyViewers } from "@/lib/require-role";

export type { LinkResult };

export type ProgressEvent =
  | { kind: "start"; totalLinks: number }
  | { kind: "result"; result: LinkResult }
  | { kind: "done"; checkedAt: string; total: number; broken: number };

/** GET /api/check-links — streams NDJSON progress events */
export async function GET() {
  const encoder = new TextEncoder();
  const line = (obj: ProgressEvent) => encoder.encode(JSON.stringify(obj) + "\n");

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await runLinkCheck(
          (total) => controller.enqueue(line({ kind: "start", totalLinks: total })),
          (r) => controller.enqueue(line({ kind: "result", result: r })),
        );
        await writeLinkCheckResult(result).catch(() => {});
        controller.enqueue(line({ kind: "done", checkedAt: result.checkedAt, total: result.total, broken: result.broken }));
      } catch (err) {
        console.error("[check-links]", err);
        controller.enqueue(encoder.encode(JSON.stringify({ kind: "error", error: String(err) }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * POST /api/check-links
 * Cron-friendly endpoint: runs the full check, saves result, returns JSON summary.
 * Requires: Authorization: Bearer <CMS_CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const cronSecret = process.env.CMS_CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CMS_CRON_SECRET not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLinkCheck();
    await writeLinkCheckResult(result);
    return NextResponse.json({ checkedAt: result.checkedAt, total: result.total, broken: result.broken });
  } catch (err) {
    console.error("[check-links POST]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
