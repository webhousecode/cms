"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Monitor, Loader2, RefreshCw } from "lucide-react";

interface PagePreviewCardProps {
  pagePath: string;
}

export function PagePreviewCard({ pagePath }: PagePreviewCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [status, setStatus] = useState<"building" | "ready" | "error">("building");

  useEffect(() => {
    let cancelled = false;

    async function buildAndServe() {
      setStatus("building");

      // 1. Rebuild the site so dist/ is fresh
      try {
        const buildRes = await fetch("/api/preview-build", { method: "POST" });
        if (!buildRes.ok) {
          // Build failed — still try to show whatever is in dist/
          console.warn("[preview] Build failed, showing cached version");
        }
      } catch {
        // Build endpoint missing — show cached
      }

      if (cancelled) return;

      // 2. Start/reuse preview server
      try {
        const serveRes = await fetch("/api/preview-serve", { method: "POST" });
        if (serveRes.ok) {
          const { url } = await serveRes.json() as { url: string };
          if (!cancelled) {
            setPreviewUrl(url);
            setStatus("ready");
          }
        } else {
          if (!cancelled) setStatus("error");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    buildAndServe();
    return () => { cancelled = true; };
  }, [pagePath]);

  const fullUrl = previewUrl ? `${previewUrl}${pagePath}` : "";

  return (
    <div
      style={{
        margin: "12px 0",
        borderRadius: "10px",
        border: "1px solid var(--border)",
        overflow: "hidden",
        backgroundColor: "var(--card)",
      }}
    >
      {/* Preview iframe */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "280px",
          backgroundColor: "var(--muted)",
          overflow: "hidden",
        }}
      >
        {status === "ready" && fullUrl ? (
          <iframe
            src={fullUrl}
            title={`Preview: ${pagePath}`}
            style={{
              width: "200%",
              height: "200%",
              transform: "scale(0.5)",
              transformOrigin: "top left",
              border: "none",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "8px",
              color: "var(--muted-foreground)",
              fontSize: "0.8rem",
            }}
          >
            {status === "building" ? (
              <>
                <RefreshCw style={{ width: "20px", height: "20px", opacity: 0.5 }} className="animate-spin" />
                Building preview...
              </>
            ) : (
              <>
                <Monitor style={{ width: "20px", height: "20px", opacity: 0.5 }} />
                Preview unavailable
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderTop: "1px solid var(--border)",
          fontSize: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--muted-foreground)" }}>
          <Monitor style={{ width: "12px", height: "12px" }} />
          <span style={{ fontFamily: "monospace" }}>{pagePath}</span>
        </div>
        {fullUrl && (
          <a
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "var(--primary)",
              textDecoration: "none",
              fontSize: "0.7rem",
              fontWeight: 500,
            }}
          >
            Open
            <ExternalLink style={{ width: "10px", height: "10px" }} />
          </a>
        )}
      </div>
    </div>
  );
}
