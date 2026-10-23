import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { denyViewers } from "@/lib/require-role";
import { getServerTSafe } from "@/i18n/server";

export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const { folder, name } = await req.json();
    const adapter = await getMediaAdapter();
    await adapter.restoreFile(folder ?? "", name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[media] restore error:", err);
    return NextResponse.json({ error: t("errApi.common.internalError") }, { status: 500 });
  }
}
