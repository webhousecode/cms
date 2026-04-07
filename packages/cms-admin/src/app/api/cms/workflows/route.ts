/**
 * Workflows collection endpoint.
 *
 * GET  /api/cms/workflows → list all workflows on the active site
 * POST /api/cms/workflows → create a new workflow
 */
import { NextRequest, NextResponse } from "next/server";
import { listWorkflows, createWorkflow } from "@/lib/agent-workflows";
import { denyViewers } from "@/lib/require-role";

export async function GET() {
  try {
    const workflows = await listWorkflows();
    return NextResponse.json(workflows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to list workflows";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    description?: string;
    steps?: { id?: string; agentId?: string; overrideCollection?: string }[];
    active?: boolean;
    schedule?: { enabled?: boolean; frequency?: "daily" | "weekly" | "manual"; time?: string; maxPerRun?: number };
    defaultPrompt?: string;
  } | null;

  if (!body || !body.name || !Array.isArray(body.steps)) {
    return NextResponse.json(
      { error: "name and steps are required" },
      { status: 400 },
    );
  }

  // Validate + normalize steps
  const steps = body.steps.map((s, i) => {
    if (!s.agentId) throw new Error(`Step ${i} is missing agentId`);
    return {
      id: s.id ?? `step-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      agentId: s.agentId,
      ...(s.overrideCollection ? { overrideCollection: s.overrideCollection } : {}),
    };
  });

  try {
    const workflow = await createWorkflow({
      name: body.name,
      description: body.description ?? "",
      steps,
      active: body.active ?? true,
      schedule: {
        enabled: body.schedule?.enabled ?? false,
        frequency: body.schedule?.frequency ?? "manual",
        time: body.schedule?.time ?? "06:00",
        maxPerRun: body.schedule?.maxPerRun ?? 1,
      },
      ...(body.defaultPrompt ? { defaultPrompt: body.defaultPrompt } : {}),
    });
    return NextResponse.json(workflow);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create workflow";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
