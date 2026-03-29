import { NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { calculateSeoScore, calculateGeoScore, type SeoFields } from "@/lib/seo/score";

export interface SeoDocSummary {
  collection: string;
  collectionLabel: string;
  slug: string;
  title: string;
  status: string;
  locale?: string;
  score: number;
  geoScore: number;
  hasTitle: boolean;
  hasDesc: boolean;
  hasOgImage: boolean;
  hasKeywords: boolean;
  optimized: boolean;
  publishAt?: string;
}

/**
 * GET /api/admin/seo
 * Returns SEO summary for all published/draft documents across all collections.
 */
export async function GET() {
  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const results: SeoDocSummary[] = [];

    // First pass: collect all meta titles for duplicate detection
    const allDocs: Array<{ col: typeof config.collections[0]; doc: any; data: Record<string, unknown>; seo: SeoFields }> = [];
    for (const col of config.collections) {
      try {
        const { documents } = await cms.content.findMany(col.name, {});
        for (const doc of documents) {
          if ((doc.status as string) === "trashed") continue;
          const data = (doc as { data?: Record<string, unknown> }).data ?? {};
          const seo = (data._seo as SeoFields) ?? {};
          allDocs.push({ col, doc, data, seo });
        }
      } catch { /* skip broken collections */ }
    }

    const allTitles = allDocs.map((d) => d.seo.metaTitle ?? "").filter(Boolean);

    for (const { col, doc, data, seo } of allDocs) {
      const { score } = calculateSeoScore(
        { slug: doc.slug, data },
        seo,
        allTitles,
      );
      const geo = calculateGeoScore(
        { slug: doc.slug, data, updatedAt: (doc as any).updatedAt },
        seo,
      );
      results.push({
        collection: col.name,
        collectionLabel: col.label ?? col.name,
        slug: doc.slug,
        title: String(data.title ?? data.name ?? doc.slug),
        status: doc.status as string,
        score,
        geoScore: geo.score,
        hasTitle: !!(seo.metaTitle),
        hasDesc: !!(seo.metaDescription),
        hasOgImage: !!(seo.ogImage),
        hasKeywords: !!(seo.keywords?.length),
        locale: (data.locale as string) || undefined,
        optimized: !!(seo.lastOptimized),
        publishAt: (doc as any).publishAt ?? undefined,
      });
    }

    // Sort by score ascending (worst first)
    results.sort((a, b) => a.score - b.score);

    const total = results.length;
    const optimized = results.filter((r) => r.optimized).length;
    const avgScore = total > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / total) : 0;
    const avgGeoScore = total > 0 ? Math.round(results.reduce((s, r) => s + r.geoScore, 0) / total) : 0;
    const missingTitle = results.filter((r) => !r.hasTitle).length;
    const missingDesc = results.filter((r) => !r.hasDesc).length;
    const missingOg = results.filter((r) => !r.hasOgImage).length;

    return NextResponse.json({
      total,
      optimized,
      avgScore,
      avgGeoScore,
      issues: { missingTitle, missingDesc, missingOg },
      documents: results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
