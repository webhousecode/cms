"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Monitor } from "lucide-react";

interface PagePreviewCardProps {
  pagePath: string;
}

export function PagePreviewCard({ pagePath }: PagePreviewCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string>("");

  useEffect(() => {
    // Get the preview server URL
    fetch("/api/preview-serve", { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { url?: string } | null) => {
        if (d?.url) setPreviewUrl(d.url);
      })
      .catch(() => {});
  }, []);

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
        {fullUrl ? (
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
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--muted-foreground)",
              fontSize: "0.8rem",
            }}
          >
            <Monitor style={{ width: "20px", height: "20px", marginRight: "8px", opacity: 0.5 }} />
            Loading preview...
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
