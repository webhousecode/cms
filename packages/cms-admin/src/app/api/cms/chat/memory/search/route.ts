import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { queryMemories } from "@/lib/chat/memory-search";
import { getServerTSafe } from "@/i18n/server";

/** GET /api/cms/chat/memory/search?q=... — search memories */
export async function GET(request: NextRequest) {
  const t = await getServerTSafe();
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: t("errCms.shared.noAccess") }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ memories: [] });
  }

  const results = await queryMemories(q, 20);
  return NextResponse.json({
    memories: results.map((r) => ({
      ...r.memory,
      score: r.score,
    })),
  });
}
