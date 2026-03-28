import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { denyViewers } from "@/lib/require-role";

export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const { folder, name } = await req.json();
    const adapter = await getMediaAdapter();
    await adapter.restoreFile(folder ?? "", name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[media] restore error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
