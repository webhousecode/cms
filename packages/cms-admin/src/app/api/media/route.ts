import { NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";

export async function GET() {
  try {
    const adapter = await getMediaAdapter();
    let files = await adapter.listMedia();
    // Filter out WebP variants (e.g. hero-400w.webp) — only show originals
    files = files.filter((f) => !/-\d+w\.webp$/i.test(f.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(files);
  } catch (err) {
    console.error("[media] list error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
