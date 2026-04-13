"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Calendar, Image, Zap, Search, Eye } from "lucide-react";
import { SiteIntroCard } from "@/components/site-intro-card";

interface CollectionStat {
  name: string;
  label: string;
  total: number;
  published: number;
  draft: number;
}

interface UpcomingItem {
  collection: string;
  collectionLabel: string;
  slug: string;
  title: string;
  publishAt?: string;
  unpublishAt?: string;
}

interface DashboardData {
  stats: CollectionStat[];
  scheduledCount: number;
  upcomingItems: UpcomingItem[];
  mediaCount: number;
  intsCount: number;
  seoAvgScore: number;
  geoAvgScore: number;
  visibilityScore: number;
  seoOptimized: number;
  seoIssues: number;
  keywordCoverage: number;
  keywordCount: number;
}

function SkeletonCard() {
  return (
    <div className="p-5 rounded-xl border border-border bg-card" style={{ minHeight: "10rem" }}>
      <div className="flex items-start justify-between mb-4">
        <div className="h-3 w-16 rounded bg-muted animate-pulse" />
        <div className="h-7 w-8 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-5 w-28 rounded bg-muted animate-pulse mb-3" />
      <div className="flex gap-3">
        <div className="h-3 w-20 rounded bg-muted animate-pulse" />
        <div className="h-3 w-16 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

export function DashboardStats() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/dashboard-stats")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: DashboardData) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });

    function onContentChanged() {
      fetch("/api/admin/dashboard-stats")
        .then((r) => r.ok ? r.json() : null)
        .then((d: DashboardData | null) => { if (d && !cancelled) setData(d); })
        .catch(() => {});
    }
    window.addEventListener("cms:content-changed", onContentChanged);
    return () => { cancelled = true; window.removeEventListener("cms:content-changed", onContentChanged); };
  }, []);

  if (error) {
    return (
      <div className="p-8 max-w-5xl">
        <p className="text-muted-foreground text-sm">Failed to load dashboard stats.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 max-w-5xl">
        <div className="mb-10">
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Dashboard</p>
          <h1 className="text-2xl font-bold text-foreground">Content Overview</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ gridAutoRows: "minmax(10rem, auto)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  const { stats, scheduledCount, upcomingItems, mediaCount, intsCount, seoAvgScore, geoAvgScore, visibilityScore, seoOptimized, seoIssues, keywordCoverage, keywordCount } = data;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-10">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Dashboard</p>
        <h1 className="text-2xl font-bold text-foreground">Content Overview</h1>
      </div>

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
  );
}
