import { getAdminCms, getAdminConfig, getActiveSiteInfo, EmptyOrgError } from "@/lib/cms";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock, Calendar, Image, Zap, Search, Eye } from "lucide-react";
import { calculateSeoScore, calculateGeoScore, type SeoFields } from "@/lib/seo/score";
import { readKeywordStore, analyzeKeywords } from "@/lib/seo/keywords";
import { getMediaAdapter } from "@/lib/media";
import { SiteIntroCard } from "@/components/site-intro-card";
import { HelpCard } from "@/components/ui/help-card";

export default async function AdminDashboard() {
  // Multi-site with no site selected → go to sites dashboard
  const siteInfo = await getActiveSiteInfo();
  if (siteInfo && !siteInfo.activeSiteId) {
    redirect("/admin/sites");
  }

  let cms, config;
  try {
    [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
  } catch (err) {
    if (err instanceof EmptyOrgError) redirect("/admin/sites");
    throw err;
  }
  if (!cms || !config) redirect("/admin/sites");

  // Collection stats + scheduled count in parallel
  const allDocsPromises = config.collections.map(async (col) => {
    const { documents } = await cms.content.findMany(col.name, {});
    return { col, documents };
  });
  const allResults = await Promise.all(allDocsPromises);

  const stats = allResults.map(({ col, documents }) => {
    const published = documents.filter((d) => d.status === "published").length;
    const draft = documents.filter((d) => d.status === "draft").length;
    return { name: col.name, label: col.label ?? col.name, total: documents.length, published, draft };
  });

  // Count scheduled items across all collections
  let scheduledCount = 0;
  const now = new Date();
  const upcomingItems: { collection: string; collectionLabel: string; slug: string; title: string; publishAt?: string; unpublishAt?: string }[] = [];
  for (const { col, documents } of allResults) {
    for (const doc of documents) {
      const publishAt = (doc as any).publishAt as string | undefined;
      const unpublishAt = (doc as any).unpublishAt as string | undefined;
      if (publishAt && new Date(publishAt) > now) {
        scheduledCount++;
        if (upcomingItems.length < 5) upcomingItems.push({ collection: col.name, collectionLabel: col.label ?? col.name, slug: doc.slug, title: String(doc.data?.title ?? doc.slug), publishAt });
      }
      if (unpublishAt && new Date(unpublishAt) > now) {
        scheduledCount++;
        if (upcomingItems.length < 5) upcomingItems.push({ collection: col.name, collectionLabel: col.label ?? col.name, slug: doc.slug, title: String(doc.data?.title ?? doc.slug), unpublishAt });
      }
    }
  }
  // Media + Interactives counts (parallel, non-blocking)
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

  // Sort upcoming by date
  upcomingItems.sort((a, b) => {
    const aDate = a.publishAt ?? a.unpublishAt ?? "";
    const bDate = b.publishAt ?? b.unpublishAt ?? "";
    return aDate.localeCompare(bDate);
  });

  return (
    <>
      <div className="p-8 max-w-5xl">
      <div className="mb-10">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Dashboard</p>
        <h1 className="text-2xl font-bold text-foreground">Content Overview</h1>
      </div>
      <HelpCard articleId="dashboard-intro" variant="compact" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ gridAutoRows: "minmax(10rem, auto)" }}>
        <SiteIntroCard />
        {stats.map((col) => (
          <Link
            key={col.name}
            href={`/admin/${col.name}`}
            className="group block p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-secondary transition-all duration-200"
          >
            <div className="flex items-start justify-between mb-4">
              <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase">{col.name}</p>
              <span className="text-2xl font-bold text-primary">{col.total}</span>
            </div>
            <p className="font-semibold text-foreground mb-3 group-hover:text-primary transition-colors">{col.label}</p>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                {col.published} published
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                {col.draft} draft
              </span>
            </div>
          </Link>
        ))}

        {/* Scheduled content card */}
        <Link
          href="/admin/scheduled"
          className="group block p-5 rounded-xl border border-border bg-card hover:border-amber-500/40 hover:bg-secondary transition-all duration-200"
        >
          <div className="flex items-start justify-between mb-4">
            <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase">scheduled</p>
            <span className="text-2xl font-bold text-amber-400">{scheduledCount}</span>
          </div>
          <p className="font-semibold text-foreground mb-3 group-hover:text-amber-400 transition-colors flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Scheduled Content
          </p>
          {upcomingItems.length > 0 ? (
            <div className="space-y-1.5">
              {upcomingItems.slice(0, 2).map((item) => {
                const date = item.publishAt ?? item.unpublishAt ?? "";
                const isExpiry = !!item.unpublishAt;
                return (
                  <div key={`${item.collection}/${item.slug}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3 shrink-0" style={{ color: isExpiry ? "rgb(239 68 68)" : "rgb(234 179 8)" }} />
                    <span className="truncate">{item.title}</span>
                    <span className="ml-auto shrink-0 font-mono" style={{ color: isExpiry ? "rgb(239 68 68)" : "rgb(234 179 8)" }}>
                      {new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
              {upcomingItems.length > 2 && (
                <p className="text-[10px] text-muted-foreground">+{upcomingItems.length - 2} more</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No upcoming scheduled content</p>
          )}
        </Link>

        {/* Media card */}
        <Link
          href="/admin/media"
          className="group block p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-secondary transition-all duration-200"
        >
          <div className="flex items-start justify-between mb-4">
            <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase">media</p>
            <span className="text-2xl font-bold text-primary">{mediaCount}</span>
          </div>
          <p className="font-semibold text-foreground mb-3 group-hover:text-primary transition-colors flex items-center gap-2">
            <Image className="w-4 h-4" />
            Media Library
          </p>
          <p className="text-xs text-muted-foreground">Images, videos, audio, files</p>
        </Link>

        {/* Interactives card */}
        <Link
          href="/admin/interactives"
          className="group block p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-secondary transition-all duration-200"
        >
          <div className="flex items-start justify-between mb-4">
            <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase">interactives</p>
            <span className="text-2xl font-bold text-primary">{intsCount}</span>
          </div>
          <p className="font-semibold text-foreground mb-3 group-hover:text-primary transition-colors flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Interactives
          </p>
          <p className="text-xs text-muted-foreground">Charts, demos, calculators</p>
        </Link>
        {/* SEO card */}
        <Link
          href="/admin/seo"
          className="group block p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-secondary transition-all duration-200"
        >
          <div className="flex items-start justify-between mb-4">
            <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase">seo</p>
            <span className="text-2xl font-bold" style={{ color: seoAvgScore >= 80 ? "#4ade80" : seoAvgScore >= 50 ? "#F7BB2E" : "#f87171" }}>
              {seoAvgScore}
            </span>
          </div>
          <p className="font-semibold text-foreground mb-3 group-hover:text-primary transition-colors flex items-center gap-2">
            <Search className="w-4 h-4" />
            SEO Health
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#4ade80" }} />
                {seoOptimized} optimized
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#f87171" }} />
                {seoIssues} need attention
              </span>
            </div>
            <div className="h-1 rounded-full mt-2" style={{ background: "var(--border)" }}>
              <div className="h-full rounded-full" style={{ width: `${seoAvgScore}%`, background: seoAvgScore >= 80 ? "#4ade80" : seoAvgScore >= 50 ? "#F7BB2E" : "#f87171" }} />
            </div>
            {keywordCount > 0 && (
              <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="font-mono" style={{ fontWeight: 600, color: keywordCoverage >= 50 ? "#4ade80" : keywordCoverage >= 20 ? "#F7BB2E" : "#f87171" }}>
                  {keywordCoverage}%
                </span>
                <span>keyword coverage ({keywordCount} tracked)</span>
              </div>
            )}
          </div>
        </Link>
        {/* Visibility card */}
        <Link
          href="/admin/visibility"
          className="group block p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-secondary transition-all duration-200"
        >
          <div className="flex items-start justify-between mb-4">
            <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase">visibility</p>
            <span className="text-2xl font-bold" style={{ color: visibilityScore >= 80 ? "#4ade80" : visibilityScore >= 50 ? "#F7BB2E" : "#f87171" }}>
              {visibilityScore}
            </span>
          </div>
          <p className="font-semibold text-foreground mb-3 group-hover:text-primary transition-colors flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Visibility
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="font-mono" style={{ fontWeight: 600, color: seoAvgScore >= 80 ? "#4ade80" : seoAvgScore >= 50 ? "#F7BB2E" : "#f87171" }}>
                  {seoAvgScore}
                </span>
                SEO
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono" style={{ fontWeight: 600, color: geoAvgScore >= 80 ? "#4ade80" : geoAvgScore >= 50 ? "#F7BB2E" : "#f87171" }}>
                  {geoAvgScore}
                </span>
                GEO
              </span>
            </div>
            <div className="h-1 rounded-full mt-2" style={{ background: "var(--border)" }}>
              <div className="h-full rounded-full" style={{ width: `${visibilityScore}%`, background: visibilityScore >= 80 ? "#4ade80" : visibilityScore >= 50 ? "#F7BB2E" : "#f87171" }} />
            </div>
            <p className="mt-1">Search engines + AI platforms</p>
          </div>
        </Link>
      </div>
    </div>
    </>
  );
}
