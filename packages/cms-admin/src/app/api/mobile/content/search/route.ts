import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { withSiteContext } from "@/lib/site-context";
import { getAdminCms } from "@/lib/cms";

/**
 * GET /api/mobile/content/search?orgId=...&siteId=...&q=qigong+sund+mad
 *
 * Full-text search across all collections in a site.
 * Returns scored results with collection, slug, title, excerpt.
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  const query = req.nextUrl.searchParams.get("q") ?? "";

  if (!orgId || !siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }
  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  return withSiteContext({ orgId, siteId }, async () => {
    const cms = await getAdminCms();
    const results = await cms.content.search(query, { limit: 30 });
    return NextResponse.json({
      results: results.map((r) => ({
        collection: r.collection,
        slug: r.slug,
        title: r.title,
        excerpt: r.excerpt ?? "",
        status: r.status,
        score: r.score,
      })),
    });
  });
}
