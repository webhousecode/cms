import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { SitePreview } from "@/components/SitePreview";
import { Spinner } from "@/components/Spinner";
import { getMe, triggerDeploy, listDeploys } from "@/api/client";
import { setActiveOrgId, setActiveSiteId, getDefaultSite, setDefaultSite, clearDefaultSite } from "@/lib/prefs";

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

  const [isDefault, setIsDefault] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [lastDeploy, setLastDeploy] = useState<{ status: string; timestamp?: string } | null>(null);

  // Persist active org+site so push notifs can fall back to last-viewed
  useEffect(() => {
    if (!params?.orgId || !params?.siteId) return;
    void setActiveOrgId(params.orgId);
    void setActiveSiteId(params.siteId);
    // Check if this is the default site
    void getDefaultSite().then((d) => {
      setIsDefault(d?.orgId === params.orgId && d?.siteId === params.siteId);
    });
  }, [params?.orgId, params?.siteId]);

  // Load last deploy status
  useEffect(() => {
    if (!params) return;
    void listDeploys(params.orgId, params.siteId)
      .then((r) => { if (r.deploys[0]) setLastDeploy(r.deploys[0]); })
      .catch(() => {});
  }, [params?.orgId, params?.siteId]);

  async function handleDeploy() {
    if (!params || deploying) return;
    setDeploying(true);
    try {
      const result = await triggerDeploy(params.orgId, params.siteId);
      setLastDeploy({ status: result.status, timestamp: new Date().toISOString() });
    } catch {
      setLastDeploy({ status: "error", timestamp: new Date().toISOString() });
    } finally {
      setDeploying(false);
    }
  }

  async function toggleDefault() {
    if (!params) return;
    if (isDefault) {
      await clearDefaultSite();
      setIsDefault(false);
    } else {
      await setDefaultSite(params.orgId, params.siteId);
      setIsDefault(true);
    }
  }

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
    // Stored defaultSite is stale — clear it and go home
    void clearDefaultSite().then(() => setLocation("/home"));
    return null;
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLocation(`/site/${params.orgId}/${params.siteId}/search`)}
                className="flex h-10 w-10 items-center justify-center rounded-full active:scale-90 transition-transform"
                aria-label="Search"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
                  <path d="M10.5 10.5L14 14" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleDefault}
                className="flex h-10 w-10 items-center justify-center rounded-full active:scale-90 transition-transform"
                aria-label={isDefault ? "Remove as default" : "Set as default"}
              >
                <svg width="20" height="20" viewBox="0 0 16 16" fill={isDefault ? "#F7BB2E" : "none"} stroke={isDefault ? "#F7BB2E" : "rgba(255,255,255,0.4)"} strokeWidth="1.5">
                  <path d="M8 1.5l2 4.1 4.5.6-3.25 3.2.75 4.5L8 11.7l-4 2.2.75-4.5L1.5 6.2l4.5-.6z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
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

          {/* Deploy */}
          <div className="rounded-xl bg-brand-darkSoft overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Deploy</p>
                {lastDeploy && (
                  <p className={`text-xs mt-0.5 ${lastDeploy.status === "success" ? "text-green-400" : lastDeploy.status === "error" ? "text-red-400" : "text-white/40"}`}>
                    {lastDeploy.status === "success" ? "✓ Deployed" : lastDeploy.status === "error" ? "✗ Failed" : lastDeploy.status}
                    {lastDeploy.timestamp && ` · ${new Date(lastDeploy.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleDeploy}
                disabled={deploying}
                className={`ml-3 shrink-0 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all active:scale-95 ${deploying ? "bg-white/10 text-white/40" : "bg-brand-gold text-brand-dark"}`}
              >
                {deploying ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-dark/30 border-t-brand-dark" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2v8M4 6l4-4 4 4M3 13h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {deploying ? "Deploying…" : "Deploy"}
              </button>
            </div>
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
