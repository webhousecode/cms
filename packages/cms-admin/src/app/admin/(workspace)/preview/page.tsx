"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Hammer } from "lucide-react";

function PreviewFrame() {
  const params = useSearchParams();
  const rawUrl = params.get("url") ?? "";
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<{ ok?: boolean; error?: string; output?: string } | null>(null);
  const [liveUrl, setLiveUrl] = useState(rawUrl);

  // Auto-start preview server if URL points to localhost (server may have died on restart)
  useEffect(() => {
    if (!rawUrl || !/localhost:\d+/.test(rawUrl)) return;
    fetch("/api/preview-serve", { method: "POST" })
      .then((r) => r.ok ? r.json() as Promise<{ url: string }> : null)
      .then((d) => {
        if (!d?.url) return;
        // Preserve the path from the original URL, only replace the base (host:port)
        try {
          const orig = new URL(rawUrl);
          const fresh = new URL(d.url);
          if (orig.host !== fresh.host) {
            fresh.pathname = orig.pathname;
            fresh.search = orig.search;
            setLiveUrl(fresh.toString());
          }
        } catch { /* invalid URL, skip */ }
      })
      .catch(() => {});
  }, [rawUrl]);

  const url = liveUrl || rawUrl;

  const reload = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  }, [url]);

  const rebuild = useCallback(async () => {
    setBuilding(true);
    setBuildResult(null);
    try {
      const res = await fetch("/api/preview-build", { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string; output?: string };
      setBuildResult(data);
      if (data.ok) {
        // Reload iframe after successful build
        setTimeout(() => {
          if (iframeRef.current) iframeRef.current.src = url;
        }, 300);
      }
    } catch {
      setBuildResult({ error: "Build request failed" });
    } finally {
      setBuilding(false);
    }
  }, [url]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 84px)" }}>
      {/* Slim toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.5rem",
        padding: "0 0.75rem", height: "36px", flexShrink: 0,
        borderBottom: "1px solid var(--border)",
        backgroundColor: "var(--card)",
        fontSize: "0.75rem", fontFamily: "monospace", color: "var(--muted-foreground)",
      }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</span>

        {/* Build result indicator */}
        {buildResult && (
          <span style={{
            fontSize: "0.65rem", padding: "0.15rem 0.5rem", borderRadius: "4px",
            background: buildResult.ok
              ? "color-mix(in srgb, #22c55e 15%, transparent)"
              : "color-mix(in srgb, var(--destructive) 15%, transparent)",
            color: buildResult.ok ? "#22c55e" : "var(--destructive)",
          }}>
            {buildResult.ok ? "Built" : "Error"}
          </span>
        )}

        {/* Rebuild button */}
        <button
          type="button"
          onClick={rebuild}
          disabled={building}
          title="Rebuild site (run build.ts)"
          style={{
            display: "flex", alignItems: "center", gap: "0.3rem",
            background: "none", border: "1px solid var(--border)", borderRadius: "4px",
            padding: "0.2rem 0.5rem", cursor: building ? "wait" : "pointer",
            color: "var(--muted-foreground)", fontSize: "0.65rem", fontWeight: 500,
            transition: "all 0.2s",
          }}
          className="hover:border-primary hover:text-primary"
        >
          <Hammer style={{ width: 11, height: 11, animation: building ? "spin 1s linear infinite" : "none" }} />
          {building ? "Building..." : "Rebuild"}
        </button>

        {/* Reload button */}
        <button
          type="button"
          onClick={reload}
          title="Reload preview"
          style={{
            display: "flex", alignItems: "center",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted-foreground)", padding: "0.2rem",
          }}
        >
          <RefreshCw style={{ width: 13, height: 13 }} />
        </button>

        {/* External link */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new browser tab"
          style={{ display: "flex", alignItems: "center", color: "var(--muted-foreground)", flexShrink: 0 }}
        >
          <ExternalLink style={{ width: 13, height: 13 }} />
        </a>
      </div>
      {url ? (
        <iframe
          ref={iframeRef}
          src={url}
          style={{ flex: 1, border: "none", width: "100%" }}
          title="Preview"
        />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
          Starting preview server...
        </div>
      )}
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense>
      <PreviewFrame />
    </Suspense>
  );
}
