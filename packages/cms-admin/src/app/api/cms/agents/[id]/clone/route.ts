import { NextRequest, NextResponse } from "next/server";
import { getAgent, createAgent } from "@/lib/agents";
import { denyViewers } from "@/lib/require-role";
import { getServerTSafe } from "@/i18n/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getServerTSafe();
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await params;
  const original = await getAgent(id);
  if (!original) return NextResponse.json({ error: t("errCms.agents.notFound") }, { status: 404 });

  const { id: _id, createdAt: _ca, updatedAt: _ua, stats: _stats, ...rest } = original;
  const cloned = await createAgent({
    ...rest,
    name: t("errCms.agents.copyOf", { name: original.name }),
    active: false,
  });

  return NextResponse.json(cloned);
}
