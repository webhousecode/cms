"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTabs } from "@/lib/tabs-context";

export function SiteIntroCard({ siteName }: { siteName: string }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const { openTab } = useTabs();

  useEffect(() => {
    // 1. Try site config for explicit URLs
    fetch("/api/admin/site-config")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const preview = data?.previewSiteUrl ?? "";
        const live = data?.deployCustomDomain
          ? `https://${data.deployCustomDomain}`
          : data?.deployProductionUrl ?? "";
        setPreviewUrl(preview);
        setLiveUrl(live);

        // 2. If no preview URL, try starting sirv preview server
        if (!preview && !live) {
          fetch("/api/preview-serve", { method: "POST" })
            .then((r) => r.ok ? r.json() : null)
            .then((d: { url?: string } | null) => {
              if (d?.url) setPreviewUrl(d.url);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const thumbnailUrl = previewUrl || liveUrl;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (thumbnailUrl) {
      openTab(`/admin/preview?url=${encodeURIComponent(thumbnailUrl)}`, `Preview: ${siteName}`);
    }
  }

  return (
    <a
      href="#"
      onClick={handleClick}
      className="group block rounded-xl border border-border bg-card hover:border-primary/40 transition-all duration-200 overflow-hidden"
      style={{ textDecoration: "none" }}
    >
      {/* Thumbnail — scaled iframe of site front page */}
      <div style={{
        width: "100%", height: "140px", overflow: "hidden",
        background: "var(--muted)", position: "relative",
      }}>
        {thumbnailUrl ? (
          <iframe
            src={thumbnailUrl}
            title={siteName}
            sandbox=""
            loading="lazy"
            style={{
              width: "1280px", height: "800px", border: "none",
              transform: "scale(0.22)", transformOrigin: "top left",
              pointerEvents: "none",
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
      <div style={{ padding: "0.75rem 1rem" }}>
        <p className="font-semibold text-foreground group-hover:text-primary transition-colors" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {siteName}
          <ExternalLink style={{ width: 12, height: 12, opacity: 0.5 }} />
        </p>
        {liveUrl && (
          <p className="text-xs text-muted-foreground font-mono mt-0.5" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {liveUrl.replace("https://", "")}
          </p>
        )}
      </div>
    </a>
  );
}
