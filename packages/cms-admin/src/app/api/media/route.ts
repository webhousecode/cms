import { NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { getServerTSafe } from "@/i18n/server";

export async function GET() {
  const t = await getServerTSafe();
  try {
    const adapter = await getMediaAdapter();
    let files = await adapter.listMedia();
    // Filter out WebP variants (e.g. hero-400w.webp) — only show originals
    files = files.filter((f) => !/-\d+w\.webp$/i.test(f.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(files);
  } catch (err) {
    console.error("[media] list error:", err);
    return NextResponse.json({ error: t("errApi.common.internalError") }, { status: 500 });
  }
}
