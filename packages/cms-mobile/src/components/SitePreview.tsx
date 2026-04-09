import { useEffect, useRef, useState } from "react";

interface SitePreviewProps {
  previewUrl: string;
  title: string;
  /** Tap → fullscreen */
  onExpand?: () => void;
}

// Cache probe results — cleared on pull-to-refresh so new URLs get re-probed
const probeCache = new Map<string, boolean>();

/** Clear the probe cache (called by pull-to-refresh) */
export function clearProbeCache() {
  probeCache.clear();
}

/**
 * Live site preview thumbnail — port of cms-admin's preview-thumb.tsx.
 *
 * **Layout invariant:** the wrapper has a FIXED 16:9 aspect ratio at all
 * times (loading, failed, ok). The iframe inside is absolutely positioned
 * and CSS-transformed to scale 1280×720 down to fit. This guarantees the
 * card never resizes between states — no layout shift, no design jumps.
 *
 * The probe is a server-side HEAD request via /api/mobile/probe-url so
 * we don't render iframes for sites that 404.
 */
export function SitePreview({ previewUrl, title, onExpand }: SitePreviewProps) {
  const [status, setStatus] = useState<"loading" | "ok" | "failed">(() => {
    if (!previewUrl) return "failed";
    if (probeCache.has(previewUrl)) return probeCache.get(previewUrl) ? "ok" : "failed";
    return "loading";
  });
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Probe via the mobile API
  useEffect(() => {
    if (!previewUrl || probeCache.has(previewUrl)) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getServerUrl, getJwt } = await import("@/lib/prefs");
        const server = await getServerUrl();
        const jwt = await getJwt();
        if (!server || !jwt) {
          probeCache.set(previewUrl, false);
          if (!cancelled) setStatus("failed");
          return;
        }
        const res = await fetch(
          `${server}/api/mobile/probe-url?url=${encodeURIComponent(previewUrl)}`,
          { headers: { Authorization: `Bearer ${jwt}` }, credentials: "omit" },
        );
        const data = (await res.json()) as { ok: boolean };
        probeCache.set(previewUrl, data.ok);
        if (!cancelled) setStatus(data.ok ? "ok" : "failed");
      } catch {
        probeCache.set(previewUrl, false);
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  // Recompute scale on resize so the iframe fills the wrapper.
  // The wrapper itself has a FIXED 16:9 aspect ratio so this only fires
  // on viewport rotation / parent resize, never on state change.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      el.style.setProperty("--thumb-scale", String(w / 1280));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <button
      type="button"
      onClick={onExpand}
      className="block w-full overflow-hidden rounded-xl bg-brand-darkSoft border border-white/10 text-left active:scale-[0.99] transition-transform"
      aria-label={`Open live preview of ${title}`}
    >
      {/* FIXED aspect ratio — same height in loading, failed, and ok states */}
      <div
        ref={wrapperRef}
        className="relative w-full overflow-hidden bg-brand-dark"
        style={{ aspectRatio: "16 / 9" }}
      >
        {status === "ok" && previewUrl && (
          <iframe
            src={previewUrl}
            title={title}
            sandbox="allow-same-origin allow-scripts"
            loading="lazy"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "1280px",
              height: "720px",
              border: "none",
              transform: "scale(var(--thumb-scale, 0.25))",
              transformOrigin: "top left",
              pointerEvents: "none",
              // Hint the iframe to render in dark mode so sites that use
              // prefers-color-scheme: dark match the app's dark UI. Without
              // this, iOS WKWebView iframes default to light regardless of
              // the parent's color scheme.
              colorScheme: "dark",
            }}
          />
        )}
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          </div>
        )}
        {status === "failed" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">
            No preview available
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
        <span className="text-xs text-white/60 truncate">
          {previewUrl || "—"}
        </span>
        <span className="ml-3 shrink-0 text-xs text-brand-gold">Open ↗</span>
      </div>
    </button>
  );
}
