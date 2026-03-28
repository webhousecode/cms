import { NextRequest, NextResponse } from "next/server";
import { readMediaMeta, appendMediaMeta } from "@/lib/media/media-meta";
import { denyViewers } from "@/lib/require-role";

/** GET /api/media/tags — Returns all unique user tags with counts */
export async function GET() {
  try {
    const meta = await readMediaMeta();
    const tagCounts = new Map<string, number>();
    for (const m of meta) {
      if (m.tags) {
        for (const t of m.tags) {
          tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
        }
      }
    }
    const tags = Array.from(tagCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tag, count]) => ({ tag, count }));
    return NextResponse.json(tags);
  } catch {
    return NextResponse.json([]);
  }
}

/** PATCH /api/media/tags — Set tags for a specific file
 *  Body: { key: string, tags: string[] } */
export async function PATCH(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const { key, tags } = (await req.json()) as { key: string; tags: string[] };
    if (!key || !Array.isArray(tags)) {
      return NextResponse.json({ error: "key and tags[] required" }, { status: 400 });
    }
    // Normalize: trim, lowercase, dedupe, remove empty
    const normalized = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort();
    await appendMediaMeta(key, { tags: normalized });
    return NextResponse.json({ key, tags: normalized });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
