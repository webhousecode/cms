import { getAdminCms, getAdminConfig, getActiveSiteInfo } from "@/lib/cms";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock, Calendar } from "lucide-react";

export default async function AdminDashboard() {
  // Multi-site with no site selected → go to sites dashboard
  const siteInfo = await getActiveSiteInfo();
  if (siteInfo && !siteInfo.activeSiteId) {
    redirect("/admin/sites");
  }

  const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              {upcomingItems.slice(0, 3).map((item) => {
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
              {upcomingItems.length > 3 && (
                <p className="text-[10px] text-muted-foreground">+{upcomingItems.length - 3} more</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No upcoming scheduled content</p>
          )}
        </Link>
      </div>
    </div>
    </>
  );
}
