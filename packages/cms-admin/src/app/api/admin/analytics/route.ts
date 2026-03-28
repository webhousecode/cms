import { NextRequest, NextResponse } from "next/server";
import { denyViewers } from "@/lib/require-role";
import {
  getRunHistory,
  getAgentStats,
  getCostSummary,
  getContentRatio,
  recordRun,
  recordContentEdit,
  type RunHistoryFilter,
} from "@/lib/analytics";

/**
 * GET /api/admin/analytics
 *
 * Query params:
 *  - view: "runs" | "agents" | "costs" | "content-ratio" (default: "runs")
 *  - agentId: filter by agent
 *  - dateFrom / dateTo: ISO date range
 *  - limit: max results (for runs)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const view = searchParams.get("view") ?? "runs";
    const agentId = searchParams.get("agentId") ?? undefined;
    const dateFrom = searchParams.get("dateFrom") ?? undefined;
    const dateTo = searchParams.get("dateTo") ?? undefined;
    const limit = searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : undefined;

    switch (view) {
      case "runs": {
        const filter: RunHistoryFilter = { agentId, dateFrom, dateTo, limit };
        const runs = await getRunHistory(filter);
        return NextResponse.json({ runs });
      }
      case "agents": {
        const stats = await getAgentStats();
        return NextResponse.json({ agents: stats });
      }
      case "costs": {
        const summary = await getCostSummary(dateFrom, dateTo);
        return NextResponse.json(summary);
      }
      case "content-ratio": {
        const ratio = await getContentRatio(dateFrom, dateTo);
        return NextResponse.json(ratio);
      }
      default:
        return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch analytics";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/admin/analytics
 *
 * Body: { type: "run" | "edit", data: RunEntry | ContentEdit }
 */
export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const body = await request.json();
    const { type, data } = body as { type: string; data: Record<string, unknown> };

    if (type === "run") {
      const entry = await recordRun(data as Parameters<typeof recordRun>[0]);
      return NextResponse.json(entry, { status: 201 });
    }

    if (type === "edit") {
      const entry = await recordContentEdit(
        data as Parameters<typeof recordContentEdit>[0]
      );
      return NextResponse.json(entry, { status: 201 });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to record entry";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
