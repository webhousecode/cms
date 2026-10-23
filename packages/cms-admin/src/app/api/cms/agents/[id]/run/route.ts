import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent-runner";
import { denyViewers } from "@/lib/require-role";
import { requireCapability } from "@/lib/capabilities";
import { getServerTSafe } from "@/i18n/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getServerTSafe();
  const denied = await denyViewers(); if (denied) return denied;
  const capDenied = await requireCapability("agents"); if (capDenied) return capDenied;
  const { id } = await params;
  const { prompt, collection } = (await request.json()) as { prompt?: string; collection?: string };

  if (!prompt?.trim()) {
    return NextResponse.json({ error: t("errCms.shared.promptIsRequired") }, { status: 400 });
  }

  try {
    const result = await runAgent(id, prompt.trim(), collection?.trim() || undefined);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : t("errCms.agents.runFailed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
