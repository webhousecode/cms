import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Spinner } from "@/components/Spinner";
import { getMe, resolveContentPath } from "@/api/client";

/**
 * Fullscreen preview with Edit FAB (F129).
 *
 * Uses server-provided `proxyPreviewUrl` which routes ALL traffic through
 * the preview-proxy. The proxy injects a URL tracking script into HTML
 * responses, so we always know what page the user is looking at.
 *
 * Tap Edit FAB → resolve tracked path → open document editor. One tap.
 */
export function SitePreviewFullscreen() {
  const [, params] = useRoute<{ orgId: string; siteId: string }>(
    "/site/:orgId/:siteId/preview",
  );
  const [, setLocation] = useLocation();
  const [currentPath, setCurrentPath] = useState("/");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(false);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const site = meQuery.data?.sites.find(
    (s) => s.orgId === params?.orgId && s.siteId === params?.siteId,
  );

  // The proxy URL from the server — signed, with URL tracking injection
  const iframeSrc = site?.proxyPreviewUrl || site?.liveUrl || site?.previewUrl;

  // Listen for URL changes from injected tracking script
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "wh-preview-url" && typeof e.data.url === "string") {
        setCurrentPath(e.data.url);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const handleEdit = useCallback(async () => {
    if (!params || resolving) return;
    setResolving(true);
    setResolveError(false);
    try {
      const result = await resolveContentPath(params.orgId, params.siteId, currentPath);
      setLocation(`/site/${params.orgId}/${params.siteId}/edit/${result.collection}/${result.slug}`);
    } catch {
      setResolveError(true);
      setTimeout(() => setResolveError(false), 2000);
    } finally {
      setResolving(false);
    }
  }, [params, currentPath, resolving, setLocation]);

  if (!params) {
    setLocation("/home");
    return null;
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-brand-dark safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-brand-dark">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase text-white/50 tracking-wider truncate">
            {site?.orgName ?? "Preview"}
          </p>
          <p className="text-sm font-medium truncate">{site?.siteName ?? "Site"}</p>
        </div>
        <span className="text-[10px] text-white/30 font-mono mx-2 truncate max-w-[120px]">
          {currentPath}
        </span>
        <button
          type="button"
          onClick={() => setLocation(`/site/${params.orgId}/${params.siteId}`)}
          aria-label="Close preview"
          className="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-darkSoft border border-white/10 text-white/90 active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Iframe */}
      {meQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center"><Spinner /></div>
      ) : iframeSrc ? (
        <iframe
          src={iframeSrc}
          title={`${site?.siteName} preview`}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          className="min-h-0 w-full flex-1 border-0"
          style={{ colorScheme: "dark", background: "#0d0d0d" }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-white/50">
          No preview URL configured
        </div>
      )}

      {/* Edit FAB */}
      {iframeSrc && (
        <button
          type="button"
          onClick={handleEdit}
          disabled={resolving}
          className={`fixed bottom-8 right-6 flex h-14 w-14 items-center justify-center rounded-full shadow-lg active:scale-90 transition-all z-10 ${
            resolveError ? "bg-red-500/80" : "bg-brand-gold"
          }`}
          style={{ transform: "translateZ(0)", WebkitTransform: "translateZ(0)" }}
          aria-label="Edit this page"
        >
          {resolving ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-dark border-t-transparent" />
          ) : resolveError ? (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <path d="M8 5v3M8 10.5v.5" stroke="#0D0D0D" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 1.5l3 3L5 14H2v-3z" stroke="#0D0D0D" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
