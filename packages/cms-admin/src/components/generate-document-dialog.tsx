"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X } from "lucide-react";

interface Props {
  collection: string;
  collectionLabel: string;
  existingData?: Record<string, unknown>;
  existingSlug?: string;
  onClose: () => void;
  onGenerated?: (data: Record<string, unknown>) => void;
}

const STATUS_MESSAGES = [
  "Analyzing prompt…",
  "Building schema context…",
  "Generating title and structure…",
  "Writing content…",
  "Composing paragraphs…",
  "Adding metadata…",
  "Selecting tags…",
  "Polishing output…",
  "Almost there…",
];

export function GenerateDocumentDialog({
  collection,
  collectionLabel,
  existingData,
  existingSlug,
  onClose,
  onGenerated,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startTimer() {
    setElapsed(0);
    setStatusIdx(0);
    let tick = 0;
    timerRef.current = setInterval(() => {
      tick++;
      setElapsed(tick);
      if (tick % 3 === 0) setStatusIdx((i) => (i + 1 < STATUS_MESSAGES.length ? i + 1 : i));
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function handleGenerate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError("");
    startTimer();

    try {
      const genRes = await fetch("/api/cms/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, collection, existingData }),
      });
      const genData = await genRes.json() as { data?: Record<string, unknown>; slug?: string; error?: string; raw?: string };
      stopTimer();

      if (!genRes.ok || !genData.data) {
        setError(genData.error ?? "Generation failed");
        setGenerating(false);
        return;
      }

      if (onGenerated) {
        onGenerated(genData.data);
        onClose();
        return;
      }

      const createRes = await fetch(`/api/cms/${collection}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: genData.slug, data: genData.data }),
      });
      const created = await createRes.json() as { slug?: string; error?: string };
      if (!createRes.ok) {
        setError(created.error ?? "Failed to create document");
        setGenerating(false);
        return;
      }

      onClose();
      router.push(`/admin/${collection}/${created.slug ?? genData.slug}`);
    } catch {
      stopTimer();
      setError("Network error");
      setGenerating(false);
    }
  }

  const formatTime = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "12px", padding: "1.5rem", maxWidth: "500px", width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Sparkles style={{ width: "1rem", height: "1rem", color: "var(--primary)" }} />
          <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
            {existingData ? "Generate content" : `Generate ${collectionLabel}`}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}
          >
            <X style={{ width: "0.875rem", height: "0.875rem" }} />
          </button>
        </div>

        {/* Prompt input */}
        {!generating && (
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            rows={3}
            placeholder={`Describe what to generate, e.g. "Write an article about the history of CMS systems from the 90's to 2026"`}
            style={{
              width: "100%", padding: "0.75rem", borderRadius: "8px",
              border: "1px solid var(--border)", background: "var(--background)",
              color: "var(--foreground)", fontSize: "0.875rem",
              outline: "none", resize: "vertical", boxSizing: "border-box",
            }}
          />
        )}

        {/* Live generation status */}
        {generating && (
          <div style={{
            padding: "1.25rem", borderRadius: "8px",
            border: "1px solid var(--border)", background: "var(--background)",
          }}>
            {/* Progress bar */}
            <div style={{
              height: "3px", borderRadius: "2px", background: "var(--secondary)",
              overflow: "hidden", marginBottom: "1rem",
            }}>
              <div style={{
                height: "100%", borderRadius: "2px",
                background: "var(--primary)",
                width: `${Math.min(95, elapsed * 0.8)}%`,
                transition: "width 2s ease-out",
              }} />
            </div>

            {/* Status text */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <Loader2 style={{ width: "0.875rem", height: "0.875rem", color: "var(--primary)", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "0.8rem", color: "var(--foreground)", fontWeight: 500 }}>
                {STATUS_MESSAGES[statusIdx]}
              </span>
            </div>

            {/* Elapsed time + model */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
              <span>Elapsed: {formatTime(elapsed)}</span>
              <span>Collection: {collectionLabel}</span>
            </div>

            {/* Prompt preview */}
            <p style={{
              fontSize: "0.7rem", color: "var(--muted-foreground)",
              marginTop: "0.75rem", fontStyle: "italic",
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              &ldquo;{prompt}&rdquo;
            </p>
          </div>
        )}

        {error && <p style={{ color: "var(--destructive)", fontSize: "0.75rem", marginTop: "0.5rem" }}>{error}</p>}

        {/* Buttons */}
        {!generating && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "0.5rem 1rem", borderRadius: "8px",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)", fontSize: "0.8rem", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              style={{
                padding: "0.5rem 1rem", borderRadius: "8px", border: "none",
                background: "var(--primary)", color: "var(--primary-foreground)",
                fontSize: "0.8rem", fontWeight: 600,
                cursor: !prompt.trim() ? "default" : "pointer",
                opacity: !prompt.trim() ? 0.6 : 1,
                display: "flex", alignItems: "center", gap: "0.375rem",
              }}
            >
              <Sparkles style={{ width: "0.875rem", height: "0.875rem" }} />
              Generate
            </button>
          </div>
        )}

        {!generating && (
          <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "0.75rem", textAlign: "center" }}>
            ⌘ Enter to generate
          </p>
        )}
      </div>
    </div>
  );
}
