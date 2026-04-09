"use client";

import { useEffect, useState } from "react";

// Cache probe results so we only check each URL once per session
const probeCache = new Map<string, boolean>();

export function NoPreviewPlaceholder() {
  return (
    <div style={{
      width: "100%", flex: 1, minHeight: "8rem",
      background: "var(--muted)", display: "flex",
      alignItems: "center", justifyContent: "center",
      color: "var(--muted-foreground)", fontSize: "0.75rem",
    }}>No preview</div>
  );
}

export function PreviewThumb({ previewUrl, title }: { previewUrl: string; title: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "failed">(
    !previewUrl ? "failed" : probeCache.has(previewUrl) ? (probeCache.get(previewUrl) ? "ok" : "failed") : "loading"
  );

  useEffect(() => {
    if (!previewUrl || probeCache.has(previewUrl)) return;
    // Probe via server-side API to avoid CORS issues
    fetch(`/api/admin/probe-url?url=${encodeURIComponent(previewUrl)}`)
      .then((r) => r.json())
      .then((d: { ok: boolean }) => {
        probeCache.set(previewUrl, d.ok);
        setStatus(d.ok ? "ok" : "failed");
      })
      .catch(() => {
        probeCache.set(previewUrl, false);
        setStatus("failed");
      });
  }, [previewUrl]);

  if (status === "failed") return <NoPreviewPlaceholder />;
  if (status === "loading") return (
    <div style={{
      width: "100%", flex: 1, minHeight: "8rem",
      background: "var(--muted)", display: "flex",
      alignItems: "center", justifyContent: "center",
      color: "var(--muted-foreground)", fontSize: "0.75rem",
    }} />
  );

  return (
    <div style={{
      width: "100%", flex: 1, minHeight: "8rem", overflow: "hidden",
      background: "var(--muted)", position: "relative",
    }}>
      <iframe
        src={previewUrl}
        title={title}
        sandbox="allow-same-origin allow-scripts"
        loading="lazy"
        style={{
          position: "absolute", top: 0, left: 0,
          width: "1280px", height: "720px", border: "none",
          transform: "scale(var(--thumb-scale, 0.25))", transformOrigin: "top left",
          pointerEvents: "none",
        }}
        ref={(el) => {
          if (el?.parentElement) {
            const w = el.parentElement.clientWidth;
            el.parentElement.style.setProperty("--thumb-scale", String(w / 1280));
          }
        }}
      />
    </div>
  );
}
