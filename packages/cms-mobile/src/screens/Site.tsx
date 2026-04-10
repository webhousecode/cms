import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { SitePreview } from "@/components/SitePreview";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { getMe } from "@/api/client";
import { setActiveOrgId, setActiveSiteId } from "@/lib/prefs";

/**
 * Site screen — scoped to one (org, site) pair.
 *
 * Phase 1.5 contents:
 *   - ScreenHeader (back button + breadcrumb + role chip)
 *   - SitePreview live thumbnail (tap → fullscreen)
 *   - Curation queue placeholder (Phase 3)
 *   - Drafts today placeholder (Phase 4)
 *
 * Phase 3-7 fill in the real features. Push notifications in Phase 2
 * deep link directly to /site/:orgId/:siteId.
 */
export function Site() {
  const [, params] = useRoute<{ orgId: string; siteId: string }>(
    "/site/:orgId/:siteId",
  );
  const [, setLocation] = useLocation();
  const goBack = useCallback(() => setLocation("/home"), [setLocation]);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  // Persist active org+site so push notifs can fall back to last-viewed
  useEffect(() => {
    if (!params?.orgId || !params?.siteId) return;
    void setActiveOrgId(params.orgId);
    void setActiveSiteId(params.siteId);
  }, [params?.orgId, params?.siteId]);

  if (!params) {
    setLocation("/home");
    return null;
  }

  if (meQuery.isLoading) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      </Screen>
    );
  }

  const site = meQuery.data?.sites.find(
    (s) => s.orgId === params.orgId && s.siteId === params.siteId,
  );

  if (!site) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <p className="text-white/60">Site not found</p>
          <Button onClick={() => setLocation("/home")}>Back to Home</Button>
        </div>
      </Screen>
    );
  }

  // Phase 1 placeholder counters — replaced by real per-site endpoints
  // in Phase 3 (curation) and Phase 4 (dashboard).
  const curationPending = 0;

  return (
      <Screen>
        <ScreenHeader
          left={<BackButton onClick={goBack} />}
          subtitle={site.orgName}
          title={site.siteName}
          right={
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70">
              {site.role}
            </span>
          }
        />

        <div className="flex flex-1 flex-col gap-3 px-6 pb-24 overflow-auto">
          {/* Preview card — prefer liveUrl (works from phone, loads all resources)
              Fall back to previewUrl (proxy, may lack sub-resources) */}
          {(site.liveUrl || site.previewUrl) ? (
            <SitePreview
              previewUrl={site.liveUrl || site.previewUrl!}
              title={site.siteName}
              onExpand={() =>
                setLocation(`/site/${params.orgId}/${params.siteId}/preview`)
              }
            />
          ) : (
            <div className="flex items-center justify-center rounded-xl bg-brand-darkSoft border border-white/10 text-center p-6" style={{ aspectRatio: "16/9" }}>
              <div>
                <p className="text-sm text-white/40">No preview configured</p>
                <p className="text-xs text-white/30 mt-1">Set a Preview URL in Site Settings</p>
              </div>
            </div>
          )}

          {/* Quick links — Preview + Live */}
          <div className="flex gap-2">
            {site.previewUrl && (
              <a
                href={site.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-darkSoft border border-white/10 px-4 py-3 text-sm text-white/80 active:scale-97 transition-transform"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="8" cy="8" r="2" fill="currentColor" />
                </svg>
                Preview
              </a>
            )}
            {site.liveUrl && (
              <a
                href={site.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-darkSoft border border-white/10 px-4 py-3 text-sm text-brand-gold active:scale-97 transition-transform"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8h12M8 2a10 10 0 014 6 10 10 0 01-4 6 10 10 0 01-4-6A10 10 0 018 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                Live
              </a>
            )}
          </div>

          <div className="rounded-xl bg-brand-darkSoft p-4">
            <p className="text-xs uppercase text-white/40">Curation queue</p>
            <p className="mt-1 text-3xl font-semibold text-brand-gold">
              {curationPending}
            </p>
            <p className="mt-1 text-xs text-white/50">
              Coming in Phase 3 — swipe to approve
            </p>
          </div>

          {/* Content editing entry point */}
          <button
            type="button"
            onClick={() => setLocation(`/site/${params.orgId}/${params.siteId}/collections`)}
            className="flex items-center gap-4 rounded-xl bg-brand-darkSoft border border-white/10 px-4 py-4 text-left active:scale-[0.98] active:bg-white/5 transition-all"
          >
            <span className="text-2xl">📝</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Content</p>
              <p className="text-xs text-white/40">Edit pages, posts and collections</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white/30 shrink-0">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Media browser entry point */}
          <button
            type="button"
            onClick={() => setLocation(`/site/${params.orgId}/${params.siteId}/media`)}
            className="flex items-center gap-4 rounded-xl bg-brand-darkSoft border border-white/10 px-4 py-4 text-left active:scale-[0.98] active:bg-white/5 transition-all"
          >
            <span className="text-2xl">🖼️</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Media</p>
              <p className="text-xs text-white/40">Browse and upload images</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white/30 shrink-0">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </Screen>
  );
}
