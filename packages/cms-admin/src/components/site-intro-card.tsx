"use client";

import { useEffect, useState } from "react";
import { useTabs } from "@/lib/tabs-context";
import { previewPath } from "@/lib/utils";
import { useHeaderData } from "@/lib/header-data-context";

export function SiteIntroCard() {
  const { siteConfig } = useHeaderData();
  const [previewUrl, setPreviewUrl] = useState("");
  const [siteName, setSiteName] = useState("Site");
  const { openTab } = useTabs();

  useEffect(() => {
    if (!siteConfig) return;

    if (siteConfig.previewSiteUrl) {
      setPreviewUrl(siteConfig.previewSiteUrl as string);
    } else {
      // Only start sirv if NO previewSiteUrl is configured
      fetch("/api/preview-serve", { method: "POST" })
        .then((r) => r.ok ? r.json() : null)
        .then((d: { url?: string } | null) => {
          if (d?.url) setPreviewUrl(d.url);
        })
        .catch(() => {});
    }
    if (siteConfig.siteName) setSiteName(siteConfig.siteName as string);
  }, [siteConfig]);

  const liveUrl = siteConfig?.deployCustomDomain
    ? `https://${siteConfig.deployCustomDomain}`
    : (siteConfig?.deployProductionUrl as string) ?? "";
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
