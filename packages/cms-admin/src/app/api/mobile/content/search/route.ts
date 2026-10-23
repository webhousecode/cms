import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getAdminCmsForSite } from "@/lib/cms";
import { getServerTSafe } from "@/i18n/server";

/**
 * GET /api/mobile/content/search?orgId=...&siteId=...&q=qigong+sund+mad
 *
 * Full-text search across all collections in a site.
 * Returns scored results with collection, slug, title, excerpt.
 */
export async function GET(req: NextRequest) {
  const t = await getServerTSafe();
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: t("errApi.common.notAuthenticated") }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  const query = req.nextUrl.searchParams.get("q") ?? "";

  if (!orgId || !siteId) {
    return NextResponse.json({ error: t("errApi.common.orgSiteRequired") }, { status: 400 });
  }
  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    const cms = await getAdminCmsForSite(orgId, siteId);
    if (!cms) return NextResponse.json({ error: t("errApi.common.siteNotFound") }, { status: 404 });
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
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : t("errApi.mobile.searchFailed") }, { status: 500 });
  }
}
