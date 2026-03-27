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
      const metaMap: Record<string, { caption?: string; alt?: string; aiTags?: string[]; userTags?: string[] }> = {};
      // Include AI metadata from analyzed files
      for (const m of analyzed) {
        metaMap[m.key as string] = {
          caption: (m.aiCaption as string) || undefined,
          alt: (m.aiAlt as string) || undefined,
          aiTags: (m.aiTags as string[]) || undefined,
          userTags: (m.tags as string[]) || undefined,
        };
      }
      // Also include user tags from non-analyzed files
      for (const m of meta) {
        if (!m.aiAnalyzedAt && m.tags && (m.tags as string[]).length > 0) {
          metaMap[m.key as string] = {
            ...metaMap[m.key as string],
            userTags: m.tags as string[],
          };
        }
      }
      return NextResponse.json({ keys, meta: metaMap });
    }

    return NextResponse.json(keys);
  } catch {
    return NextResponse.json([]);
  }
}
