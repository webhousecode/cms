/**
 * Per-agent feedback log (Phase 2 of Agents Overhaul).
 *
 * GET  — return the most recent feedback entries for an agent
 * POST — append a manual feedback entry (curator-submitted)
 *
 * Curator edits during approval and rejection notes are recorded
 * automatically by the curation/[id]/approve and reject routes;
 * this endpoint exists for manual / programmatic submissions and
 * for the agent detail page's "Recent feedback" panel.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  appendFeedback,
  readFeedback,
  type FeedbackType,
} from "@/lib/agent-feedback";
import { denyViewers } from "@/lib/require-role";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit") ?? "10"),
    100,
  );
  const all = await readFeedback(id);
  const recent = all.slice(-limit).reverse();
  return NextResponse.json({ entries: recent, total: all.length });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyViewers();
  if (denied) return denied;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    type?: FeedbackType;
    queueItemId?: string;
    field?: string;
    original?: string;
    corrected?: string;
    notes?: string;
  } | null;

  if (!body || !body.type) {
    return NextResponse.json(
      { error: "type is required (correction|rejection|edit)" },
      { status: 400 },
    );
  }
  if (!["correction", "rejection", "edit"].includes(body.type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  try {
    const entry = await appendFeedback(id, {
      type: body.type,
      queueItemId: body.queueItemId,
      field: body.field,
      original: body.original,
      corrected: body.corrected,
      notes: body.notes,
    });
    return NextResponse.json(entry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to record feedback";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
