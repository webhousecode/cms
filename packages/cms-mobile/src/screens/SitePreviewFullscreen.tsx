import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Spinner } from "@/components/Spinner";
import { getMe } from "@/api/client";

/**
 * Fullscreen live iframe preview of a site.
 *
 * Layout: flex column inside a `safe-top` + `safe-bottom` container so
 * the iframe NEVER overlaps the status bar / dynamic island / home
 * indicator. Header sits in flow (not absolute overlay) consuming
 * safe-area-top; iframe fills the remaining space.
 *
 * Reached via tap on the SitePreview thumb on the Site screen. Tap the
 * X button (top-right) to return to the Site screen. Phase 1.6 will add
 * a swipe-down gesture to dismiss + drag handle per user direction.
 */
export function SitePreviewFullscreen() {
  const [, params] = useRoute<{ orgId: string; siteId: string }>(
    "/site/:orgId/:siteId/preview",
  );
  const [, setLocation] = useLocation();

  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });

  if (!params) {
    setLocation("/home");
    return null;
  }

  const site = meQuery.data?.sites.find(
    (s) => s.orgId === params.orgId && s.siteId === params.siteId,
  );

  return (
    <div className="flex h-screen w-screen flex-col bg-brand-dark safe-top safe-bottom">
      {/* Header — IN FLOW so safe-area-top push iframe down */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-brand-dark">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase text-white/50 tracking-wider truncate">
            {site?.orgName ?? "Preview"}
          </p>
          <p className="text-sm font-medium truncate">{site?.siteName ?? "Site"}</p>
        </div>
        <button
          type="button"
          onClick={() => setLocation(`/site/${params.orgId}/${params.siteId}`)}
          aria-label="Close preview"
          className="ml-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-darkSoft border border-white/10 text-white/90 active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Iframe fills the remaining space below the header and above
          the home indicator (safe-bottom on the parent). */}
      {meQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : (site?.liveUrl || site?.previewUrl) ? (
        <iframe
          src={site.liveUrl || site.previewUrl!}
          title={`${site.siteName} live preview`}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          className="min-h-0 w-full flex-1 border-0"
          // Same color-scheme hint as the thumbnail — iOS WKWebView iframes
          // default to light unless told otherwise.
          style={{ colorScheme: "dark", background: "#0d0d0d" }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-white/50">
          No preview URL configured for this site
        </div>
      )}
    </div>
  );
}
