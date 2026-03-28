import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "@/lib/site-paths";

/** GET /api/media/ai-meta?file=/uploads/filename.jpg
 *  Returns AI metadata for a specific image from media-meta.json */
export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  if (!file) return NextResponse.json({ error: "file param required" }, { status: 400 });

  try {
    const { dataDir } = await getActiveSitePaths();
    const metaPath = path.join(dataDir, "media-meta.json");
    let meta: Array<Record<string, unknown>> = [];
    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
    } catch { return NextResponse.json(null); }

    // Normalize: /uploads/foo.jpg → foo.jpg, /uploads/folder/foo.jpg → folder/foo.jpg
    const key = file.replace(/^\/(api\/)?uploads\//, "");

    const entry = meta.find((m) => m.key === key);
    if (!entry) return NextResponse.json(null);

    return NextResponse.json({
      caption: entry.aiCaption ?? null,
      alt: entry.aiAlt ?? null,
      tags: entry.aiTags ?? [],
      analyzedAt: entry.aiAnalyzedAt ?? null,
      provider: entry.aiProvider ?? null,
      userTags: entry.tags ?? [],
      // Per-locale fields (F48 i18n)
      captions: entry.aiCaptions ?? null,
      alts: entry.aiAlts ?? null,
    });
  } catch {
    return NextResponse.json(null);
  }
}
