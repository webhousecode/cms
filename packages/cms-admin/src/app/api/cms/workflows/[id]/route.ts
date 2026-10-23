/**
 * Single workflow endpoint.
 *
 * GET    /api/cms/workflows/[id] → fetch one workflow
 * PUT    /api/cms/workflows/[id] → update fields
 * DELETE /api/cms/workflows/[id] → remove permanently
 */
import { NextRequest, NextResponse } from "next/server";
import { getWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/agent-workflows";
import { denyViewers } from "@/lib/require-role";
import { getServerTSafe } from "@/i18n/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getServerTSafe();
  const { id } = await params;
  const workflow = await getWorkflow(id);
  if (!workflow) return NextResponse.json({ error: t("errCms.shared.notFound") }, { status: 404 });
  return NextResponse.json(workflow);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getServerTSafe();
  const denied = await denyViewers();
  if (denied) return denied;
  const { id } = await params;
  try {
    const body = (await request.json()) as Record<string, unknown>;

    // Normalise step shape the same way POST does — every step must
    // have a stable id even if the client only sent agentId. Stats are
    // never accepted from the client (would let curators reset their
    // own counters), so strip them if present.
    if (Array.isArray(body.steps)) {
      body.steps = (body.steps as { id?: string; agentId?: string; overrideCollection?: string }[]).map((s, i) => {
        if (!s.agentId) throw new Error(t("errCms.shared.stepMissingAgent", { index: i }));
        return {
          id: s.id ?? `step-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          agentId: s.agentId,
          ...(s.overrideCollection ? { overrideCollection: s.overrideCollection } : {}),
        };
      });
    }
    delete body.stats;
    delete body.id;
    delete body.createdAt;

    const updated = await updateWorkflow(id, body);
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : t("errCms.workflows.updateFailed");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getServerTSafe();
  const denied = await denyViewers();
  if (denied) return denied;
  const { id } = await params;
  try {
    await deleteWorkflow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : t("errCms.shared.failedToDelete");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
