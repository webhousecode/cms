import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { useSwipeBack } from "@/lib/use-swipe-back";
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
  useSwipeBack(goBack);

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
  const draftsToday = 0;

  return (
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={() => setLocation("/home")} />}
        subtitle={site.orgName}
        title={site.siteName}
        right={
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70">
            {site.role}
          </span>
        }
      />

      <div className="flex flex-1 flex-col gap-3 px-6 pb-24">
        {/* Live preview card — always shown, placeholder if no URL */}
        {site.previewUrl ? (
          <SitePreview
            previewUrl={site.previewUrl}
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

        <div className="rounded-xl bg-brand-darkSoft p-4">
          <p className="text-xs uppercase text-white/40">Curation queue</p>
          <p className="mt-1 text-3xl font-semibold text-brand-gold">
            {curationPending}
          </p>
          <p className="mt-1 text-xs text-white/50">
            Coming in Phase 3 — swipe to approve
          </p>
        </div>

        <div className="rounded-xl bg-brand-darkSoft p-4">
          <p className="text-xs uppercase text-white/40">Drafts today</p>
          <p className="mt-1 text-3xl font-semibold text-white">{draftsToday}</p>
          <p className="mt-1 text-xs text-white/50">
            Coming in Phase 4 — daily dashboard
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-white/10 p-4">
          <p className="text-xs text-white/40">
            Phase 1 placeholder — site-scoped editing arrives in Phase 3-7
          </p>
        </div>
      </div>
    </Screen>
  );
}
