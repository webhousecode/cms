import { NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { calculateSeoScore, calculateGeoScore, type SeoFields } from "@/lib/seo/score";
import { readKeywordStore, analyzeKeywords } from "@/lib/seo/keywords";
import { getMediaAdapter } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    if (!cms || !config) {
      return NextResponse.json({ error: "No site" }, { status: 404 });
    }

    // Load all docs in parallel
    const allResults = await Promise.all(
      config.collections.map(async (col) => {
        const { documents } = await cms.content.findMany(col.name, {});
        return { col: { name: col.name, label: col.label ?? col.name }, documents };
      }),
    );

    // Collection stats
    const stats = allResults.map(({ col, documents }) => {
      const published = documents.filter((d) => d.status === "published").length;
      const draft = documents.filter((d) => d.status === "draft").length;
      return { name: col.name, label: col.label, total: documents.length, published, draft };
    });

    // Scheduled items
    const now = new Date();
    let scheduledCount = 0;
    const upcomingItems: { collection: string; collectionLabel: string; slug: string; title: string; publishAt?: string; unpublishAt?: string }[] = [];
    for (const { col, documents } of allResults) {
      for (const doc of documents) {
        const publishAt = (doc as any).publishAt as string | undefined;
        const unpublishAt = (doc as any).unpublishAt as string | undefined;
        if (publishAt && new Date(publishAt) > now) {
          scheduledCount++;
          if (upcomingItems.length < 5) upcomingItems.push({ collection: col.name, collectionLabel: col.label, slug: doc.slug, title: String(doc.data?.title ?? doc.slug), publishAt });
        }
        if (unpublishAt && new Date(unpublishAt) > now) {
          scheduledCount++;
          if (upcomingItems.length < 5) upcomingItems.push({ collection: col.name, collectionLabel: col.label, slug: doc.slug, title: String(doc.data?.title ?? doc.slug), unpublishAt });
        }
      }
    }
    upcomingItems.sort((a, b) => {
      const aDate = a.publishAt ?? a.unpublishAt ?? "";
      const bDate = b.publishAt ?? b.unpublishAt ?? "";
      return aDate.localeCompare(bDate);
    });

    // Media + Interactives counts (parallel)
    const mediaAdapter = await getMediaAdapter();
    const [mediaFiles, intsList] = await Promise.all([
      mediaAdapter.listMedia().catch(() => []),
      mediaAdapter.listInteractives().catch(() => []),
    ]);
    const mediaCount = mediaFiles.filter((m) =>
      (m as any).status !== "trashed" &&
      !/-\d+w\.webp$/i.test(m.name) &&
      !m.name.startsWith(".")
    ).length;
    const intsCount = intsList.filter((m) => m.status !== "trashed").length;

    // SEO + GEO stats
    let seoTotal = 0;
    let seoScoreSum = 0;
    let geoScoreSum = 0;
    let seoOptimized = 0;
    let seoIssues = 0;
    for (const { documents } of allResults) {
      for (const doc of documents) {
        if ((doc.status as string) === "trashed") continue;
        const data = (doc as { data?: Record<string, unknown> }).data ?? {};
        const seo = (data._seo as SeoFields) ?? {};
        const { score } = calculateSeoScore({ slug: doc.slug, data }, seo);
        const geo = calculateGeoScore({ slug: doc.slug, data, updatedAt: (doc as any).updatedAt }, seo);
        seoTotal++;
        seoScoreSum += score;
        geoScoreSum += geo.score;
        if (seo.lastOptimized) seoOptimized++;
        if (score < 80) seoIssues++;
      }
    }
    const seoAvgScore = seoTotal > 0 ? Math.round(seoScoreSum / seoTotal) : 0;
    const geoAvgScore = seoTotal > 0 ? Math.round(geoScoreSum / seoTotal) : 0;
    const visibilityScore = Math.round((seoAvgScore * 0.5) + (geoAvgScore * 0.5));

    // Keyword coverage
    let keywordCoverage = 0;
    let keywordCount = 0;
    try {
      const store = await readKeywordStore();
      if (store.keywords.length > 0) {
        const kwDocs = allResults.flatMap(({ col, documents }) =>
          documents
            .filter((d) => (d.status as string) !== "trashed")
            .map((d) => {
              const data = (d as { data?: Record<string, unknown> }).data ?? {};
              const content = String(data.content ?? data.body ?? "")
                .replace(/<[^>]+>/g, " ").replace(/[#*_~`>]/g, "").trim();
              return {
                collection: col.name, slug: d.slug,
                title: String(data.title ?? d.slug), content,
                seo: (data._seo as SeoFields) ?? {},
              };
            }),
        );
        const analyses = analyzeKeywords(store.keywords, kwDocs);
        keywordCount = analyses.length;
        keywordCoverage = keywordCount > 0
          ? Math.round(analyses.reduce((sum, a) => sum + a.coverage, 0) / keywordCount)
          : 0;
      }
    } catch { /* no keywords file */ }

    return NextResponse.json({
      stats,
      scheduledCount,
      upcomingItems,
      mediaCount,
      intsCount,
      seoAvgScore,
      geoAvgScore,
      visibilityScore,
      seoOptimized,
      seoIssues,
      keywordCoverage,
      keywordCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load stats" },
      { status: 500 },
    );
  }
}
