"use client";

import { useState, useCallback, useRef } from "react";
import { Eye, Code, Save, Download, Check, Loader2, Copy } from "lucide-react";

interface ArtifactCardProps {
  title: string;
  html: string;
}

export function ArtifactCard({ title, html }: ArtifactCardProps) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Inject <base> tag so relative URLs (/uploads/...) resolve against the CMS server
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const htmlWithBase = html.includes("<base")
    ? html
    : html.replace(/<head([^>]*)>/, `<head$1><base href="${baseUrl}/">`);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const blob = new Blob([html], { type: "text/html" });
      const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.html`;
      const formData = new FormData();
      formData.append("file", blob, filename);
      const res = await fetch("/api/interactives", { method: "POST", body: formData });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json().catch(() => ({ error: "Save failed" }));
        setSaveError(data.error ?? "Save failed");
      }
    } catch {
      setSaveError("Network error");
    }
    setSaving(false);
  }, [html, title]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([html], { type: "text/html" });
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.html`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [html, title]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [html]);

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
      {/* Header with tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1rem" }}>🏝️</span>
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>{title}</span>
        </div>
        <div style={{ display: "flex", gap: "2px" }}>
          {([
            { id: "preview" as const, label: "Preview", icon: Eye },
            { id: "code" as const, label: "Code", icon: Code },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 10px",
                borderRadius: "5px",
                border: "none",
                fontSize: "0.7rem",
                fontWeight: 500,
                cursor: "pointer",
                backgroundColor: tab === id ? "var(--muted)" : "transparent",
                color: tab === id ? "var(--foreground)" : "var(--muted-foreground)",
                transition: "all 100ms",
              }}
            >
              <Icon style={{ width: "12px", height: "12px" }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === "preview" ? (
        <div
          style={{
            width: "100%",
            height: "400px",
            backgroundColor: "#fff",
            overflow: "hidden",
          }}
        >
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts allow-same-origin"
            srcDoc={htmlWithBase}
            title={title}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <button
            onClick={handleCopy}
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              padding: "3px 8px",
              cursor: "pointer",
              color: copied ? "rgb(74 222 128)" : "var(--muted-foreground)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "0.65rem",
              zIndex: 1,
            }}
          >
            {copied ? <Check style={{ width: "11px", height: "11px" }} /> : <Copy style={{ width: "11px", height: "11px" }} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <pre
            style={{
              margin: 0,
              padding: "12px 14px",
              fontSize: "0.75rem",
              lineHeight: 1.5,
              fontFamily: "monospace",
              backgroundColor: "var(--muted)",
              color: "var(--foreground)",
              overflowX: "auto",
              maxHeight: "400px",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <code>{html}</code>
          </pre>
        </div>
      )}

      {/* Footer with actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <button
          onClick={handleSave}
          disabled={saving || saved}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 14px",
            borderRadius: "6px",
            border: "none",
            fontSize: "0.8rem",
            fontWeight: 500,
            cursor: saving ? "wait" : "pointer",
            backgroundColor: saved ? "rgb(74 222 128)" : "var(--primary)",
            color: saved ? "#000" : "var(--primary-foreground)",
            transition: "all 150ms",
          }}
        >
          {saving ? (
            <Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" />
          ) : saved ? (
            <Check style={{ width: "14px", height: "14px" }} />
          ) : (
            <Save style={{ width: "14px", height: "14px" }} />
          )}
          {saving ? "Saving..." : saved ? "Saved to Interactives" : "Save to CMS"}
        </button>

        <button
          onClick={handleDownload}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 14px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            fontSize: "0.8rem",
            fontWeight: 500,
            cursor: "pointer",
            backgroundColor: "transparent",
            color: "var(--foreground)",
          }}
        >
          <Download style={{ width: "14px", height: "14px" }} />
          Download
        </button>

        {saveError && (
          <span style={{ fontSize: "0.75rem", color: "var(--destructive)" }}>{saveError}</span>
        )}
      </div>
    </div>
  );
}
