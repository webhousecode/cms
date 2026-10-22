"use client";

import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import { Download, Upload, Zap, FileArchive, CheckCircle, AlertTriangle, Key, Send, Copy } from "lucide-react";
import { BeamProgressModal } from "./beam-progress-modal";
import { BeamImportModal } from "./beam-import-modal";
import { useT } from "@/lib/i18n-context";

/** Renders a translated sentence whose {placeholders} are React nodes (e.g. <code>). */
function fillNodes(template: string, nodes: Record<string, React.ReactNode>): React.ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && m[1] in nodes ? <Fragment key={i}>{nodes[m[1]]}</Fragment> : part;
  });
}

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

interface BeamProgress {
  beamId: string;
  phase: string;
  totalFiles: number;
  transferredFiles: number;
  totalBytes: number;
  transferredBytes: number;
  currentFile: string;
  error?: string;
  checksumErrors?: number;
  secretsRequired?: string[];
}

export function BeamSettingsPanel({ orgId }: { orgId: string }) {
  const t = useT();
  // ── Export state ──
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  // ── Import state ──
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importModalFile, setImportModalFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Token state ──
  const [generatingToken, setGeneratingToken] = useState(false);
  const [beamToken, setBeamToken] = useState<{ token: string; expiresAt: string } | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // ── Live Beam (push) state ──
  const [targetUrl, setTargetUrl] = useState("");
  const [pushToken, setPushToken] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState<BeamProgress | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushDone, setPushDone] = useState(false);
  const [activeBeamId, setActiveBeamId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // SSE listener for push progress
  const connectSSE = useCallback((beamId: string) => {
    const es = new EventSource(`/api/admin/beam/status?beamId=${beamId}`);
    es.addEventListener("progress", (e) => {
      const data: BeamProgress = JSON.parse(e.data);
      setPushProgress(data);
      if (data.phase === "done") {
        setPushing(false);
        setPushDone(true);
        es.close();
      } else if (data.phase === "error") {
        setPushing(false);
        setPushError(data.error ?? t("integrations.beamSettings.transferFailed"));
        es.close();
      }
    });
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [t]);

  // ── Export handler ──
  async function handleExport() {
    setExporting(true);
    setExportDone(false);
    try {
      const res = await fetch("/api/admin/beam/export", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: t("integrations.beamSettings.exportFailed") }));
        throw new Error(data.error);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const fileName = match?.[1] ?? "site.beam";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : t("integrations.beamSettings.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  // ── Import handler — opens the progress modal which owns the XHR upload. ──
  function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setImportError(t("integrations.beamSettings.chooseFileFirst"));
      return;
    }
    if (!file.name.endsWith(".beam")) {
      setImportError(t("integrations.beamSettings.mustBeBeam"));
      return;
    }
    setImportResult(null);
    setImportError(null);
    setImportModalFile(file);
  }

  // ── Token generation handler ──
  async function handleGenerateToken() {
    setGeneratingToken(true);
    try {
      const res = await fetch("/api/admin/beam/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBeamToken({ token: data.token, expiresAt: data.expiresAt });
      setTokenCopied(false);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : t("integrations.beamSettings.tokenFailed"));
    } finally {
      setGeneratingToken(false);
    }
  }

  function handleCopyToken() {
    if (!beamToken) return;
    navigator.clipboard.writeText(beamToken.token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  }

  // ── Push handler ──
  async function handlePush() {
    if (!targetUrl || !pushToken) return;
    setPushing(true);
    setPushError(null);
    setPushProgress(null);
    setPushDone(false);
    setActiveBeamId(null);
    setModalOpen(true);

    try {
      const res = await fetch("/api/admin/beam/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: targetUrl.replace(/\/+$/, ""),
          token: pushToken,
          orgId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? t("integrations.beamSettings.pushFailed"));
      }

      if (data.beamId && data.beamId !== "pending") {
        // We have a beamId — modal will subscribe to SSE for live progress.
        // Broadcast so admin-header can show a persistent pill if user
        // closes the modal.
        setActiveBeamId(data.beamId);
        window.dispatchEvent(new CustomEvent("cms:beam-started", { detail: { beamId: data.beamId, targetUrl } }));
      } else {
        // No beamId returned — fallback for older API
        setPushing(false);
        setPushDone(true);
      }
    } catch (err) {
      setPushing(false);
      setPushError(err instanceof Error ? err.message : t("integrations.beamSettings.pushFailed"));
      setModalOpen(false);
    }
  }

  // Progress bar percentage
  const progressPct = pushProgress
    ? pushProgress.totalFiles > 0
      ? Math.round((pushProgress.transferredFiles / pushProgress.totalFiles) * 100)
      : 0
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Live progress modal */}
      {modalOpen && activeBeamId && (
        <BeamProgressModal
          beamId={activeBeamId}
          targetUrl={targetUrl}
          onMinimize={() => setModalOpen(false)}
          onClose={() => {
            setModalOpen(false);
            setPushing(false);
            setActiveBeamId(null);
          }}
        />
      )}
      {/* Import progress modal */}
      {importModalFile && (
        <BeamImportModal
          file={importModalFile}
          orgId={orgId}
          onDone={(r) => setImportResult(r)}
          onClose={() => {
            setImportModalFile(null);
            if (fileRef.current) fileRef.current.value = "";
            setImportFileName(null);
          }}
        />
      )}
      {/* ── Export ── */}
      <div style={{
        padding: "1.25rem",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <Zap style={{ width: 18, height: 18, color: "var(--brand)" }} />
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>{t("integrations.beamSettings.exportHeading")}</h3>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0 0 1rem", lineHeight: 1.5 }}>
          {fillNodes(t("integrations.beamSettings.exportIntro"), { file: <code style={{ fontSize: "0.72rem", padding: "1px 4px", borderRadius: 3, background: "var(--muted)" }}>.beam</code> })}
        </p>
        <button
          data-testid="beam-export-button"
          onClick={handleExport}
          disabled={exporting}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.45rem 1rem",
            borderRadius: 6,
            border: "none",
            background: "var(--brand)",
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
              {t("integrations.beamSettings.creatingArchive")}
            </>
          ) : exportDone ? (
            <>
              <CheckCircle style={{ width: 14, height: 14 }} />
              {t("integrations.beamSettings.downloaded")}
            </>
          ) : (
            <>
              <Download style={{ width: 14, height: 14 }} />
              {t("integrations.beamSettings.downloadBeam")}
            </>
          )}
        </button>
      </div>

      {/* ── Live Beam (Push) ── */}
      <div style={{
        padding: "1.25rem",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <Send style={{ width: 18, height: 18, color: "var(--brand)" }} />
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>{t("integrations.beamSettings.liveHeading")}</h3>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0 0 1rem", lineHeight: 1.5 }}>
          {t("integrations.beamSettings.liveIntro")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--muted-foreground)", display: "block", marginBottom: "0.25rem" }}>
              {t("integrations.beamSettings.targetUrl")}
            </label>
            <input
              data-testid="beam-target-url-input"
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://remote-cms.example.com"
              disabled={pushing}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                fontSize: "0.8rem",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--muted-foreground)", display: "block", marginBottom: "0.25rem" }}>
              {t("integrations.beamSettings.beamToken")}
            </label>
            <input
              data-testid="beam-token-input"
              type="text"
              value={pushToken}
              onChange={(e) => setPushToken(e.target.value)}
              placeholder="beam_..."
              disabled={pushing}
              style={{
                width: "100%",
                padding: "0.4rem 0.6rem",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
              }}
            />
          </div>
        </div>

        <button
          data-testid="beam-push-button"
          onClick={handlePush}
          disabled={pushing || !targetUrl || !pushToken}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.45rem 1rem",
            borderRadius: 6,
            border: "none",
            background: "var(--brand)",
            color: "#0D0D0D",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: pushing || !targetUrl || !pushToken ? "not-allowed" : "pointer",
            opacity: pushing || !targetUrl || !pushToken ? 0.5 : 1,
          }}
        >
          {pushing ? (
            <>
              <Zap style={{ width: 14, height: 14 }} />
              {t("integrations.beamSettings.beaming")}
            </>
          ) : pushDone ? (
            <>
              <CheckCircle style={{ width: 14, height: 14 }} />
              {t("integrations.beamSettings.beamComplete")}
            </>
          ) : (
            <>
              <Zap style={{ width: 14, height: 14 }} />
              {t("integrations.beamSettings.beamSite")}
            </>
          )}
        </button>

        {/* Progress bar */}
        {pushing && pushProgress && (
          <div style={{ marginTop: "1rem" }}>
            <div style={{
              height: 6,
              borderRadius: 3,
              background: "var(--muted)",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${progressPct}%`,
                background: "var(--brand)",
                borderRadius: 3,
                transition: "width 0.3s ease",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.35rem" }}>
              <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                {pushProgress.currentFile || t("integrations.beamSettings.starting")}
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontWeight: 600 }}>
                {progressPct}% ({pushProgress.transferredFiles}/{pushProgress.totalFiles})
              </span>
            </div>
          </div>
        )}

        {/* Push success */}
        {pushDone && pushProgress && (
          <div style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: 6,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
            fontSize: "0.78rem",
          }}>
            <CheckCircle style={{ width: 14, height: 14, display: "inline", verticalAlign: "text-bottom", marginRight: 4, color: "#22c55e" }} />
            {t("integrations.beamSettings.beamedSuccessfully")}
            {pushProgress.checksumErrors && pushProgress.checksumErrors > 0 && (
              <span style={{ color: "var(--status-warning)" }}> ({t("integrations.beamSettings.checksumWarnings", { n: pushProgress.checksumErrors })})</span>
            )}
          </div>
        )}

        {/* Push error */}
        {pushError && (
          <div style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: 6,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            fontSize: "0.78rem",
            color: "#ef4444",
          }}>
            {pushError}
          </div>
        )}
      </div>

      {/* ── Beam Token (Receive) ── */}
      <div style={{
        padding: "1.25rem",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <Key style={{ width: 18, height: 18, color: "var(--foreground)" }} />
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>{t("integrations.beamSettings.beamToken")}</h3>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0 0 1rem", lineHeight: 1.5 }}>
          {t("integrations.beamSettings.tokenIntro")}
        </p>

        <button
          data-testid="beam-generate-token-button"
          onClick={handleGenerateToken}
          disabled={generatingToken}
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
            cursor: generatingToken ? "wait" : "pointer",
            opacity: generatingToken ? 0.7 : 1,
          }}
        >
          <Key style={{ width: 14, height: 14 }} />
          {generatingToken ? t("integrations.beamSettings.generating") : t("integrations.beamSettings.generateToken")}
        </button>

        {beamToken && (
          <div style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: 6,
            background: "var(--muted)",
            border: "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <code style={{ fontSize: "0.72rem", flex: 1, wordBreak: "break-all", fontFamily: "monospace" }}>
                {beamToken.token}
              </code>
              <button
                data-testid="beam-copy-token-button"
                onClick={handleCopyToken}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "0.25rem 0.5rem",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--foreground)",
                  fontSize: "0.7rem",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Copy style={{ width: 12, height: 12 }} />
                {tokenCopied ? t("integrations.beamSettings.copied") : t("integrations.beamSettings.copy")}
              </button>
            </div>
            <p style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", margin: 0 }}>
              {t("integrations.beamSettings.expires", { time: new Date(beamToken.expiresAt).toLocaleTimeString() })}
            </p>
          </div>
        )}
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
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>{t("integrations.beamSettings.importHeading")}</h3>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0 0 1rem", lineHeight: 1.5 }}>
          {fillNodes(t("integrations.beamSettings.importIntro"), { file: <code style={{ fontSize: "0.72rem", padding: "1px 4px", borderRadius: 3, background: "var(--muted)" }}>.beam</code> })}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            data-testid="beam-file-input"
            ref={fileRef}
            type="file"
            accept=".beam"
            style={{ display: "none" }}
            onChange={(e) => {
              setImportResult(null);
              setImportError(null);
              setImportFileName(e.target.files?.[0]?.name ?? null);
            }}
          />
          <button
            data-testid="beam-choose-file-button"
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.45rem 1rem",
              borderRadius: 6,
              border: "1px dashed var(--border)",
              background: "transparent",
              color: importFileName ? "var(--foreground)" : "var(--muted-foreground)",
              fontSize: "0.78rem",
              cursor: "pointer",
            }}
          >
            <FileArchive style={{ width: 14, height: 14 }} />
            {importFileName ?? t("integrations.beamSettings.chooseFile")}
          </button>
          <button
            data-testid="beam-import-button"
            onClick={handleImport}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.45rem 1rem",
              borderRadius: 6,
              border: "none",
              background: "var(--brand)",
              color: "#0D0D0D",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("integrations.beamSettings.import")}
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
              {t("integrations.beamSettings.imported", { name: importResult.siteName })}
            </div>
            <div style={{ color: "var(--muted-foreground)" }}>
              {t("integrations.beamSettings.importStats", { docs: importResult.stats.contentFiles, media: importResult.stats.mediaFiles, config: importResult.stats.dataFiles })}
              {importResult.checksumErrors > 0 && (
                <span style={{ color: "var(--status-warning)" }}> · {t("integrations.beamSettings.checksumWarnings", { n: importResult.checksumErrors })}</span>
              )}
            </div>
            {importResult.secretsRequired.length > 0 && (
              <div style={{ marginTop: "0.5rem", color: "var(--status-warning)" }}>
                <AlertTriangle style={{ width: 13, height: 13, display: "inline", verticalAlign: "text-bottom", marginRight: 4 }} />
                {t("integrations.beamSettings.secretsNeeded", { secrets: importResult.secretsRequired.join(", ") })}
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
