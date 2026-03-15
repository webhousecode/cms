import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";

export async function POST(req: NextRequest) {
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
