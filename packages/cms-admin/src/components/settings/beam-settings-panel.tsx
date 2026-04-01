"use client";

import { useState, useRef } from "react";
import { Download, Upload, Zap, FileArchive, CheckCircle, AlertTriangle } from "lucide-react";

interface ExportStats {
  contentFiles: number;
  mediaFiles: number;
  dataFiles: number;
  totalSizeBytes: number;
  collections: Record<string, number>;
}

interface ImportResult {
  success: boolean;
  siteId: string;
  siteName: string;
  stats: ExportStats;
  secretsRequired: string[];
  checksumErrors: number;
  error?: string;
}

export function BeamSettingsPanel({ orgId }: { orgId: string }) {
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    setExportDone(false);
    try {
      const res = await fetch("/api/admin/beam/export", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(data.error);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const fileName = match?.[1] ?? "site.beam";

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".beam")) {
      setImportError("File must be a .beam archive");
      return;
    }

    setImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("orgId", orgId);

      const res = await fetch("/api/admin/beam/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Import failed");
      }
      setImportResult(data);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* ── Export ── */}
      <div style={{
        padding: "1.25rem",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <Zap style={{ width: 18, height: 18, color: "#F7BB2E" }} />
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>Beam Export</h3>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0 0 1rem", lineHeight: 1.5 }}>
          Download a complete <code style={{ fontSize: "0.72rem", padding: "1px 4px", borderRadius: 3, background: "var(--muted)" }}>.beam</code> archive
          of this site — content, media, config, agents, and settings. Secrets are automatically stripped.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.45rem 1rem",
            borderRadius: 6,
            border: "none",
            background: "#F7BB2E",
            color: "#0D0D0D",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: exporting ? "wait" : "pointer",
            opacity: exporting ? 0.7 : 1,
          }}
        >
          {exporting ? (
            <>
              <FileArchive style={{ width: 14, height: 14 }} />
              Creating archive...
            </>
          ) : exportDone ? (
            <>
              <CheckCircle style={{ width: 14, height: 14 }} />
              Downloaded!
            </>
          ) : (
            <>
              <Download style={{ width: 14, height: 14 }} />
              Download .beam
            </>
          )}
        </button>
      </div>

      {/* ── Import ── */}
      <div style={{
        padding: "1.25rem",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <Upload style={{ width: 18, height: 18, color: "var(--foreground)" }} />
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>Beam Import</h3>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0 0 1rem", lineHeight: 1.5 }}>
          Import a <code style={{ fontSize: "0.72rem", padding: "1px 4px", borderRadius: 3, background: "var(--muted)" }}>.beam</code> archive
          from another CMS instance. The site will be added to your current organization.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <input
            ref={fileRef}
            type="file"
            accept=".beam"
            style={{ fontSize: "0.78rem" }}
            onChange={() => { setImportResult(null); setImportError(null); }}
          />
          <button
            onClick={handleImport}
            disabled={importing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.45rem 1rem",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--foreground)",
              fontSize: "0.8rem",
              fontWeight: 500,
              cursor: importing ? "wait" : "pointer",
              opacity: importing ? 0.7 : 1,
            }}
          >
            {importing ? "Importing..." : "Import"}
          </button>
        </div>

        {/* Import result */}
        {importResult && (
          <div style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: 6,
            background: importResult.checksumErrors > 0 ? "rgba(250,180,50,0.08)" : "rgba(34,197,94,0.08)",
            border: `1px solid ${importResult.checksumErrors > 0 ? "rgba(250,180,50,0.2)" : "rgba(34,197,94,0.2)"}`,
            fontSize: "0.78rem",
          }}>
            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
              <CheckCircle style={{ width: 14, height: 14, display: "inline", verticalAlign: "text-bottom", marginRight: 4, color: "#22c55e" }} />
              Imported "{importResult.siteName}"
            </div>
            <div style={{ color: "var(--muted-foreground)" }}>
              {importResult.stats.contentFiles} documents · {importResult.stats.mediaFiles} media · {importResult.stats.dataFiles} config files
              {importResult.checksumErrors > 0 && (
                <span style={{ color: "#f59e0b" }}> · {importResult.checksumErrors} checksum warnings</span>
              )}
            </div>
            {importResult.secretsRequired.length > 0 && (
              <div style={{ marginTop: "0.5rem", color: "#f59e0b" }}>
                <AlertTriangle style={{ width: 13, height: 13, display: "inline", verticalAlign: "text-bottom", marginRight: 4 }} />
                Secrets needed: {importResult.secretsRequired.join(", ")}
              </div>
            )}
          </div>
        )}

        {/* Import error */}
        {importError && (
          <div style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: 6,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            fontSize: "0.78rem",
            color: "#ef4444",
          }}>
            {importError}
          </div>
        )}
      </div>
    </div>
  );
}
