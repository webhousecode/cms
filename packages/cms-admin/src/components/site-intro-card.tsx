"use client";

import { useEffect, useState } from "react";
import { useTabs } from "@/lib/tabs-context";
import { previewPath } from "@/lib/utils";

export function SiteIntroCard() {
  const [previewUrl, setPreviewUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [siteName, setSiteName] = useState("Site");
  const { openTab } = useTabs();

  useEffect(() => {
    // 1. Always try sirv preview server first — it works for all filesystem sites
    fetch("/api/preview-serve", { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { url?: string } | null) => {
        if (d?.url) setPreviewUrl(d.url);
      })
      .catch(() => {});

    // 2. Also fetch site config for live URL display + site name
    fetch("/api/admin/site-config")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        // previewSiteUrl overrides sirv if explicitly set
        if (data?.previewSiteUrl) setPreviewUrl(data.previewSiteUrl);
        const live = data?.deployCustomDomain
          ? `https://${data.deployCustomDomain}`
          : data?.deployProductionUrl ?? "";
        setLiveUrl(live);
        if (data?.siteName) setSiteName(data.siteName);
      })
      .catch(() => {});
  }, []);

  const thumbnailUrl = previewUrl || liveUrl;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (thumbnailUrl) {
      openTab(previewPath(thumbnailUrl), `Preview: ${siteName}`);
    }
  }

  return (
    <a
      href="#"
      onClick={handleClick}
      className="group block rounded-xl border border-border bg-card hover:border-primary/40 transition-all duration-200 overflow-hidden"
      style={{ textDecoration: "none" }}
    >
      {/* Thumbnail — scaled iframe of site front page, fills entire card */}
      <div style={{
        width: "100%", minHeight: "100%", overflow: "hidden",
        background: "var(--muted)", position: "relative",
      }}>
        {thumbnailUrl ? (
          <iframe
            src={thumbnailUrl}
            title={siteName}
            sandbox="allow-same-origin allow-scripts"
            loading="lazy"
            style={{
              position: "absolute", top: 0, left: 0,
              width: "1280px", height: "720px", border: "none",
              transform: "scale(var(--thumb-scale, 0.25))", transformOrigin: "top left",
              pointerEvents: "none",
            }}
            ref={(el) => {
              // Calculate scale to fill card width
              if (el?.parentElement) {
                const w = el.parentElement.clientWidth;
                el.parentElement.style.setProperty("--thumb-scale", String(w / 1280));
              }
            }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "var(--muted-foreground)", fontSize: "0.75rem",
          }}>Loading preview...</div>
        )}
      </div>
    </a>
  );
}
