"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";

function PreviewFrame() {
  const params = useSearchParams();
  const url = params.get("url") ?? "";

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
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new browser tab"
          style={{ display: "flex", alignItems: "center", color: "var(--muted-foreground)", flexShrink: 0 }}
        >
          <ExternalLink style={{ width: "13px", height: "13px" }} />
        </a>
      </div>
      <iframe
        src={url}
        style={{ flex: 1, border: "none", width: "100%" }}
        title="Preview"
      />
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
