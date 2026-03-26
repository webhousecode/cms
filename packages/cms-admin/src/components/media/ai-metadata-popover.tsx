"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Copy, Check, Loader2, RefreshCw } from "lucide-react";

interface AIMetadata {
  caption: string | null;
  alt: string | null;
  tags: string[];
  analyzedAt: string;
  provider: string | null;
}

interface Props {
  /** Image URL, e.g. /uploads/filename.jpg */
  imageUrl: string;
  /** Trigger element style — "button" for standalone, "ctx" for context toolbar */
  variant?: "button" | "ctx";
  /** Optional callback when analyze completes */
  onAnalyzed?: (meta: AIMetadata) => void;
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: "20px", height: "20px", borderRadius: "4px",
        border: "none", background: "transparent", cursor: "pointer",
        color: copied ? "#4ade80" : "var(--muted-foreground)",
        flexShrink: 0,
      }}
    >
      {copied ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
    </button>
  );
}

export function AIMetadataPopover({ imageUrl, variant = "button", onAnalyzed }: Props) {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<AIMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Fetch metadata when opened
  useEffect(() => {
    if (!open || !imageUrl) return;
    setLoading(true);
    setError(null);
    fetch(`/api/media/ai-meta?file=${encodeURIComponent(imageUrl)}`)
      .then((r) => r.json())
      .then((data) => {
        setMeta(data);
        setLoading(false);
      })
      .catch(() => {
        setMeta(null);
        setLoading(false);
      });
  }, [open, imageUrl]);

  async function runAnalysis() {
    setAnalyzing(true);
    setError(null);
    try {
      const filename = imageUrl.replace(/^\/(api\/)?uploads\//, "");
      const parts = filename.split("/");
      const name = parts.pop()!;
      const folder = parts.join("/");

      const res = await fetch("/api/media/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: name, folder }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Analysis failed");
        setAnalyzing(false);
        return;
      }
      const result = await res.json();
      const newMeta: AIMetadata = {
        caption: result.caption,
        alt: result.alt,
        tags: result.tags,
        analyzedAt: new Date().toISOString(),
        provider: "gemini-2.0-flash",
      };
      setMeta(newMeta);
      onAnalyzed?.(newMeta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
    setAnalyzing(false);
  }

  const isCtx = variant === "ctx";

  return (
    <div style={{ position: "relative", display: "inline-flex" }} ref={ref}>
      {/* Trigger button */}
      {isCtx ? (
        <button
          type="button"
          title="AI metadata"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "flex", alignItems: "center", gap: "3px",
            padding: "2px 6px", borderRadius: "4px",
            border: "none", background: open ? "rgba(255,255,255,0.1)" : "transparent",
            cursor: "pointer", color: "var(--foreground)", fontSize: "0.7rem",
          }}
        >
          <Sparkles style={{ width: 12, height: 12 }} />
          <span style={{ fontWeight: 500 }}>AI</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.375rem",
            padding: "0.35rem 0.75rem", borderRadius: "6px",
            border: "1px solid var(--border)", background: "transparent",
            cursor: "pointer", color: "var(--foreground)", fontSize: "0.8rem",
          }}
        >
          <Sparkles style={{ width: 14, height: 14 }} />
          AI
        </button>
      )}

      {/* Popover */}
      {open && (
        <div style={{
          position: "absolute",
          top: isCtx ? "100%" : "100%",
          left: isCtx ? "50%" : 0,
          transform: isCtx ? "translateX(-50%)" : undefined,
          marginTop: "6px",
          width: "320px",
          background: "var(--popover)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          zIndex: 100,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "0.625rem 0.875rem",
            borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <Sparkles style={{ width: 14, height: 14 }} /> AI Image Analysis
            </span>
            {meta && (
              <button
                type="button"
                title="Re-analyze"
                disabled={analyzing}
                onClick={runAnalysis}
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  border: "none", background: "transparent", cursor: "pointer",
                  color: "var(--muted-foreground)", fontSize: "0.65rem",
                }}
              >
                {analyzing ? (
                  <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
                ) : (
                  <RefreshCw style={{ width: 12, height: 12 }} />
                )}
              </button>
            )}
          </div>

          {/* Body */}
          <div style={{ padding: "0.75rem 0.875rem" }}>
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted-foreground)", fontSize: "0.8rem", padding: "1rem 0" }}>
                <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Loading…
              </div>
            )}

            {!loading && !meta && !analyzing && (
              <div style={{ textAlign: "center", padding: "1rem 0" }}>
                <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
                  No AI analysis yet.
                </p>
                <button
                  type="button"
                  onClick={runAnalysis}
                  disabled={analyzing}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "0.375rem",
                    padding: "0.4rem 1rem", borderRadius: "6px",
                    border: "none", background: "var(--primary)", color: "var(--primary-foreground)",
                    cursor: "pointer", fontSize: "0.8rem", fontWeight: 500,
                  }}
                >
                  <Sparkles style={{ width: 14, height: 14 }} /> Analyze
                </button>
              </div>
            )}

            {analyzing && !meta && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted-foreground)", fontSize: "0.8rem", padding: "1rem 0", justifyContent: "center" }}>
                <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Analyzing image…
              </div>
            )}

            {error && (
              <p style={{ fontSize: "0.75rem", color: "var(--destructive)", marginBottom: "0.5rem" }}>{error}</p>
            )}

            {meta && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {/* Caption */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                    <span style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>Caption</span>
                    {meta.caption && <CopyBtn text={meta.caption} label="caption" />}
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--foreground)", margin: 0, lineHeight: 1.4 }}>
                    {meta.caption ?? "—"}
                  </p>
                </div>

                {/* Alt-text */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                    <span style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>Alt-text</span>
                    {meta.alt && <CopyBtn text={meta.alt} label="alt-text" />}
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--foreground)", margin: 0, fontFamily: "monospace", lineHeight: 1.4 }}>
                    {meta.alt ?? "—"}
                  </p>
                </div>

                {/* Tags */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>Tags</span>
                    {meta.tags.length > 0 && <CopyBtn text={meta.tags.join(", ")} label="tags" />}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {meta.tags.length > 0 ? meta.tags.map((tag) => (
                      <span key={tag} style={{
                        fontSize: "0.7rem", padding: "2px 8px", borderRadius: "9999px",
                        background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
                        color: "var(--foreground)",
                      }}>{tag}</span>
                    )) : <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>—</span>}
                  </div>
                </div>

                {/* Timestamp */}
                {meta.analyzedAt && (
                  <p style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", margin: 0, fontFamily: "monospace" }}>
                    Analyzed: {new Date(meta.analyzedAt).toLocaleString()} · {meta.provider}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
