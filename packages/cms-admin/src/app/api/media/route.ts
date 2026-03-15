import { NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";

export async function GET() {
  try {
    const adapter = await getMediaAdapter();
    const files = await adapter.listMedia();
    files.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(files);
  } catch (err) {
    console.error("[media] list error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
