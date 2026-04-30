"use client";

import { useEffect, useState } from "react";
import { CheckCircle, AlertTriangle, X, Minimize2, Zap } from "lucide-react";

interface BeamProgress {
  beamId: string;
  phase: string;
  totalFiles: number;
  transferredFiles: number;
  totalBytes: number;
  transferredBytes: number;
  currentFile: string;
  error?: string;
}

interface Props {
  beamId: string;
  targetUrl: string;
  onClose: () => void;
  onMinimize: () => void;
}

const PHASE_LABEL: Record<string, string> = {
  initiate: "Connecting to target CMS",
  files: "Sending files",
  finalize: "Finalizing",
  done: "Complete!",
  error: "Failed",
};

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Full-screen progress modal for an active Beam transfer. Connects via SSE to
 * the beam status stream and renders a live gauge with file count + bytes.
 *
 * "Run in background" lets the user close the modal while the transfer keeps
 * going — admin-header listens for the same SSE events to show a persistent
 * pill so the user can re-open progress at any time.
 */
export function BeamProgressModal({ beamId, targetUrl, onClose, onMinimize }: Props) {
  const [progress, setProgress] = useState<BeamProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/admin/beam/status?beamId=${beamId}`);
    es.addEventListener("progress", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as BeamProgress;
        setProgress(data);
        if (data.phase === "done") { setDone(true); es.close(); window.dispatchEvent(new CustomEvent("cms:beam-done", { detail: { beamId, success: true } })); }
        else if (data.phase === "error") { setError(data.error ?? "Transfer failed"); es.close(); window.dispatchEvent(new CustomEvent("cms:beam-done", { detail: { beamId, success: false, error: data.error } })); }
      } catch { /* skip parse errors */ }
    });
    es.onerror = () => { /* SSE will reconnect */ };
    return () => es.close();
  }, [beamId]);

  const filePct = progress && progress.totalFiles > 0
    ? Math.round((progress.transferredFiles / progress.totalFiles) * 100)
    : 0;
  const bytePct = progress && progress.totalBytes > 0
    ? Math.round((progress.transferredBytes / progress.totalBytes) * 100)
    : 0;
  const phaseLabel = progress ? (PHASE_LABEL[progress.phase] ?? progress.phase) : "Starting...";

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !done && !error) onMinimize(); }}
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "1.5rem",
          minWidth: "400px",
          maxWidth: "560px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {done ? <CheckCircle style={{ width: 18, height: 18, color: "rgb(74 222 128)" }} />
              : error ? <AlertTriangle style={{ width: 18, height: 18, color: "var(--destructive)" }} />
              : <Zap style={{ width: 18, height: 18, color: "#F7BB2E" }} className="animate-pulse" />}
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
              {done ? "Beam complete" : error ? "Beam failed" : "Beaming…"}
            </h2>
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {!done && !error && (
              <button
                type="button"
                onClick={onMinimize}
                title="Run in background"
                style={{
                  background: "none", border: "1px solid var(--border)",
                  borderRadius: 6, padding: "0.3rem 0.55rem",
                  cursor: "pointer", color: "var(--muted-foreground)",
                  display: "flex", alignItems: "center", gap: "0.3rem",
                  fontSize: "0.7rem",
                }}
              >
                <Minimize2 style={{ width: 12, height: 12 }} />
                Run in background
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--muted-foreground)", padding: "0.3rem",
              }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>

        {/* Target */}
        <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginBottom: "1rem", fontFamily: "monospace" }}>
          → {targetUrl}
        </div>

        {/* Phase + status */}
        <div style={{ marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{phaseLabel}</span>
          {progress && progress.totalFiles > 0 && (
            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
              {progress.transferredFiles} / {progress.totalFiles} files
            </span>
          )}
        </div>

        {/* File-count progress bar */}
        <div style={{ height: 8, borderRadius: 4, background: "var(--muted)", overflow: "hidden", marginBottom: "0.5rem" }}>
          <div style={{
            height: "100%",
            width: `${filePct}%`,
            background: error ? "var(--destructive)" : done ? "rgb(74 222 128)" : "#F7BB2E",
            borderRadius: 4,
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Bytes + current file */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%", fontFamily: "monospace" }}>
            {progress?.currentFile || "—"}
          </span>
          {progress && progress.totalBytes > 0 && (
            <span style={{ fontFamily: "monospace" }}>
              {formatBytes(progress.transferredBytes)} / {formatBytes(progress.totalBytes)} ({bytePct}%)
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: "0.75rem",
            padding: "0.6rem 0.8rem",
            background: "color-mix(in srgb, var(--destructive) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--destructive) 40%, transparent)",
            borderRadius: 6,
            fontSize: "0.75rem",
            color: "var(--destructive)",
          }}>
            {error}
          </div>
        )}

        {/* Actions on success */}
        {done && (
          <button
            type="button"
            onClick={onClose}
            style={{
              marginTop: "0.5rem", width: "100%",
              padding: "0.5rem 1rem", borderRadius: 6,
              border: "none", background: "rgb(74 222 128)",
              color: "#0D0D0D", fontSize: "0.85rem", fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
