import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { chatJobs } from "../_jobs";

/**
 * GET /api/mobile/chat/poll?jobId=...&after=0
 *
 * Poll for new SSE events from a running chat job.
 * Returns accumulated events since `after` index.
 * No streaming — simple JSON response. Works reliably in WKWebView.
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  const after = parseInt(req.nextUrl.searchParams.get("after") ?? "0", 10);

  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const job = chatJobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const newEvents = job.events.slice(after);
  return NextResponse.json({
    events: newEvents,
    cursor: job.events.length,
    done: job.done,
  });
}
