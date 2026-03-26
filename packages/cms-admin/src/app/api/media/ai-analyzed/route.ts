import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "@/lib/site-paths";

/** GET /api/media/ai-analyzed
 *  Returns an array of media keys that have aiAnalyzedAt set. */
export async function GET() {
  try {
    const { dataDir } = await getActiveSitePaths();
    const metaPath = path.join(dataDir, "media-meta.json");
    let meta: Array<Record<string, unknown>> = [];
    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
    } catch {
      return NextResponse.json([]);
    }

    const analyzed = meta
      .filter((m) => m.aiAnalyzedAt)
      .map((m) => m.key as string);

    return NextResponse.json(analyzed);
  } catch {
    return NextResponse.json([]);
  }
}
