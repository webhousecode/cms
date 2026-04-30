"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, AlertTriangle, X, Upload, FileArchive, Loader2 } from "lucide-react";

interface ImportResult {
  success: boolean;
  siteId: string;
  siteName: string;
  stats: {
    contentFiles: number;
    mediaFiles: number;
    dataFiles: number;
    totalSizeBytes: number;
    collections: Record<string, number>;
  };
  secretsRequired: string[];
  checksumErrors: number;
}

interface Props {
  file: File;
  orgId: string;
  onClose: () => void;
  onDone: (result: ImportResult) => void;
}

type Phase = "uploading" | "processing" | "done" | "error";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Two-phase progress modal for Beam Import:
 *
 *   1. Uploading — XMLHttpRequest exposes upload bytes/total via the upload
 *      event listener, so we render a real % gauge while the .beam file
 *      streams to the server.
 *   2. Processing — once upload completes the server unpacks the archive,
 *      validates checksums, and writes the new site. We can't see inside
 *      that step (it's a synchronous lib call), so we show an indeterminate
 *      spinner with a clear "Processing on server" label.
 *
 * On success: shows result stats. On error: shows the message.
 */
export function BeamImportModal({ file, orgId, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("uploading");
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) setUploaded(e.loaded);
    });
    xhr.upload.addEventListener("load", () => {
      setPhase("processing");
      setUploaded(file.size);
    });
    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          setResult(data);
          setPhase("done");
          onDone(data);
        } else {
          setError(data.error ?? `Import failed (HTTP ${xhr.status})`);
          setPhase("error");
        }
      } catch {
        setError(`Import failed (HTTP ${xhr.status})`);
        setPhase("error");
      }
    });
    xhr.addEventListener("error", () => { setError("Network error during import"); setPhase("error"); });
    xhr.addEventListener("abort", () => { setError("Import cancelled"); setPhase("error"); });

    // Send raw binary — multipart/form-data fails on large bodies via
    // Next.js' request.formData() parser. Metadata goes in query string.
    const qs = new URLSearchParams({ orgId, filename: file.name });
    xhr.open("POST", `/api/admin/beam/import?${qs.toString()}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.send(file);

    return () => {
      // Don't abort on unmount — let the import finish in the background.
      xhrRef.current = null;
    };
  }, [file, orgId, onDone]);

  const uploadPct = file.size > 0 ? Math.round((uploaded / file.size) * 100) : 0;

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
    >
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "1.5rem",
        minWidth: 400, maxWidth: 560, width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {phase === "done" ? <CheckCircle style={{ width: 18, height: 18, color: "rgb(74 222 128)" }} />
              : phase === "error" ? <AlertTriangle style={{ width: 18, height: 18, color: "var(--destructive)" }} />
              : phase === "uploading" ? <Upload style={{ width: 18, height: 18, color: "#F7BB2E" }} />
              : <Loader2 style={{ width: 18, height: 18, color: "#F7BB2E" }} className="animate-spin" />}
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
              {phase === "done" ? "Import complete"
                : phase === "error" ? "Import failed"
                : phase === "uploading" ? "Uploading file"
                : "Processing on server"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === "uploading" || phase === "processing"}
            title={phase === "uploading" || phase === "processing" ? "Cannot close while import is running" : "Close"}
            style={{
              background: "none", border: "none", color: "var(--muted-foreground)",
              cursor: phase === "uploading" || phase === "processing" ? "not-allowed" : "pointer",
              padding: "0.3rem", opacity: phase === "uploading" || phase === "processing" ? 0.4 : 1,
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* File info */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          <FileArchive style={{ width: 14, height: 14 }} />
          <span style={{ fontFamily: "monospace" }}>{file.name}</span>
          <span>·</span>
          <span>{formatBytes(file.size)}</span>
        </div>

        {/* Upload phase */}
        {phase === "uploading" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>Sending to server</span>
              <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>
                {formatBytes(uploaded)} / {formatBytes(file.size)} ({uploadPct}%)
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "var(--muted)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${uploadPct}%`,
                background: "#F7BB2E",
                borderRadius: 4,
                transition: "width 0.2s ease",
              }} />
            </div>
          </>
        )}

        {/* Processing phase */}
        {phase === "processing" && (
          <div style={{
            padding: "1rem",
            background: "var(--muted)",
            borderRadius: 6,
            display: "flex", alignItems: "center", gap: "0.75rem",
          }}>
            <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
            <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
              Server is unpacking the archive, validating checksums, and installing site files.
              This usually takes 5–30 seconds.
            </div>
          </div>
        )}

        {/* Done */}
        {phase === "done" && result && (
          <>
            <div style={{
              padding: "0.85rem",
              background: "color-mix(in srgb, rgb(74 222 128) 12%, transparent)",
              border: "1px solid color-mix(in srgb, rgb(74 222 128) 40%, transparent)",
              borderRadius: 6,
              fontSize: "0.78rem",
              marginBottom: "0.75rem",
            }}>
              <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>
                Site &ldquo;{result.siteName}&rdquo; imported successfully
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.2rem 0.75rem" }}>
                <span>Site ID:</span><span style={{ fontFamily: "monospace" }}>{result.siteId}</span>
                <span>Content files:</span><span>{result.stats.contentFiles}</span>
                <span>Media files:</span><span>{result.stats.mediaFiles}</span>
                <span>Data files:</span><span>{result.stats.dataFiles}</span>
                <span>Total size:</span><span>{formatBytes(result.stats.totalSizeBytes)}</span>
                {result.checksumErrors > 0 && (
                  <><span style={{ color: "var(--destructive)" }}>Checksum errors:</span><span style={{ color: "var(--destructive)" }}>{result.checksumErrors}</span></>
                )}
              </div>
              {result.secretsRequired.length > 0 && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                  ⚠ Re-enter these secrets in Site Settings: {result.secretsRequired.join(", ")}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: "100%", padding: "0.5rem 1rem", borderRadius: 6,
                border: "none", background: "rgb(74 222 128)",
                color: "#0D0D0D", fontSize: "0.85rem", fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </>
        )}

        {/* Error */}
        {phase === "error" && (
          <>
            <div style={{
              padding: "0.85rem",
              background: "color-mix(in srgb, var(--destructive) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--destructive) 40%, transparent)",
              borderRadius: 6,
              fontSize: "0.78rem",
              color: "var(--destructive)",
              marginBottom: "0.75rem",
            }}>
              {error ?? "Unknown error"}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: "100%", padding: "0.5rem 1rem", borderRadius: 6,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)", fontSize: "0.85rem", fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
