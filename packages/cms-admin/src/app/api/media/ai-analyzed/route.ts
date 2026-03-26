import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "@/lib/site-paths";

/** GET /api/media/ai-analyzed
 *  Returns an array of media keys that have aiAnalyzedAt set.
 *  With ?meta=1, returns { keys: string[], meta: Record<string, {caption,tags}> } */
export async function GET(request: Request) {
  try {
    const { dataDir } = await getActiveSitePaths();
    const metaPath = path.join(dataDir, "media-meta.json");
    let meta: Array<Record<string, unknown>> = [];
    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
    } catch {
      return NextResponse.json([]);
    }

    const analyzed = meta.filter((m) => m.aiAnalyzedAt);
    const keys = analyzed.map((m) => m.key as string);

    const url = new URL(request.url);
    if (url.searchParams.get("meta") === "1") {
      const metaMap: Record<string, { caption?: string; alt?: string; tags?: string[] }> = {};
      for (const m of analyzed) {
        metaMap[m.key as string] = {
          caption: (m.aiCaption as string) || undefined,
          alt: (m.aiAlt as string) || undefined,
          tags: (m.aiTags as string[]) || undefined,
        };
      }
      return NextResponse.json({ keys, meta: metaMap });
    }

    return NextResponse.json(keys);
  } catch {
    return NextResponse.json([]);
  }
}
