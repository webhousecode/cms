"use client";

/**
 * F59 phase 4 — Authenticator app (TOTP) management panel.
 *
 * Replaces the placeholder "Authenticator app" panel in Account → Security.
 * Three states:
 *   1. disabled  → "Add new app" button → enroll
 *   2. enrolling → show QR + secret + 6-digit input + "Verify"
 *   3. enabled   → status info, "Disable" with code prompt
 *
 * Compatible with Microsoft Authenticator, Google Authenticator, Authy,
 * 1Password, Bitwarden, Raivo, etc.
 */

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n-context";
import { useFormat } from "@/lib/format-locale";

interface Status {
  enabled: boolean;
  createdAt?: string;
  lastUsedAt?: string;
  backupCodesRemaining?: number;
}

export function TotpPanel() {
  const t = useT();
  const fmt = useFormat();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");

  // Enrollment state
  const [enrolling, setEnrolling] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [enrollCode, setEnrollCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Disable state
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/auth/totp", { credentials: "same-origin" });
      const data = (await res.json()) as Status;
      setStatus(data);
    } catch {
      setError(t("settings.totp.loadError"));
    }
  }

  useEffect(() => { void load(); }, []);

  async function startEnroll() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/totp/enroll/start", { method: "POST", credentials: "same-origin" });
      const data = (await res.json()) as { qrDataUrl?: string; secret?: string; error?: string };
      if (!res.ok || !data.qrDataUrl) throw new Error(data.error ?? t("settings.totp.failed"));
      setQrDataUrl(data.qrDataUrl);
      setSecret(data.secret ?? "");
      setEnrolling(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.totp.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/totp/enroll/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: enrollCode }),
      });
      const data = (await res.json()) as { ok?: boolean; backupCodes?: string[]; error?: string };
      if (!res.ok || !data.backupCodes) throw new Error(data.error ?? t("settings.totp.verificationFailed"));
      setBackupCodes(data.backupCodes);
      setEnrolling(false);
      setQrDataUrl("");
      setSecret("");
      setEnrollCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.totp.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/totp", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? t("settings.totp.failed"));
      setConfirmDisable(false);
      setDisableCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.totp.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3
            className="text-muted-foreground dark:text-white"
            style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0 }}
          >
            {t("settings.totp.heading")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("settings.totp.description")}
          </p>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {status?.enabled ? t("settings.totp.enabled") : t("settings.totp.disabled")}
        </span>
      </div>

      {/* Backup codes display (post-enrollment) */}
      {backupCodes && (
        <div style={{ padding: "0.75rem", border: "1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)", borderRadius: "6px", background: "color-mix(in srgb, var(--status-warning) 5%, transparent)" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 600, margin: "0 0 0.5rem", color: "var(--status-warning)" }}>
            {t("settings.totp.saveCodesTitle")}
          </p>
          <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: "0 0 0.75rem" }}>
            {t("settings.totp.saveCodesHint")}
          </p>
          <pre style={{
            fontFamily: "ui-monospace, monospace", fontSize: "0.85rem", margin: 0,
            padding: "0.5rem", background: "var(--muted)", borderRadius: "4px",
            color: "var(--foreground)", whiteSpace: "pre-wrap",
          }}>
            {backupCodes.join("\n")}
          </pre>
          <button
            data-testid="totp-backup-codes-saved-button"
            onClick={() => setBackupCodes(null)}
            style={{
              marginTop: "0.5rem", fontSize: "0.7rem", padding: "0.25rem 0.6rem",
              borderRadius: "4px", border: "1px solid var(--border)",
              background: "transparent", color: "var(--foreground)", cursor: "pointer",
            }}
          >
            {t("settings.totp.savedThem")}
          </button>
        </div>
      )}

      {/* Enrollment */}
      {enrolling && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0, textAlign: "center" }}>
            {t("settings.totp.scanHint")}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt={t("settings.totp.qrAlt")} style={{ width: "180px", height: "180px", background: "#fff", borderRadius: "6px" }} />
          {secret && (
            <details style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
              <summary style={{ cursor: "pointer" }}>{t("settings.totp.cantScan")}</summary>
              <code style={{ display: "block", marginTop: "0.4rem", padding: "0.4rem", background: "var(--muted)", borderRadius: "4px", wordBreak: "break-all" }}>
                {secret}
              </code>
            </details>
          )}
          <input
            data-testid="totp-enroll-code-input"
            type="text"
            inputMode="numeric"
            value={enrollCode}
            onChange={(e) => setEnrollCode(e.target.value)}
            placeholder="123456"
            style={{
              padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border)",
              background: "var(--background)", color: "var(--foreground)", fontSize: "1rem",
              textAlign: "center", letterSpacing: "0.2em", width: "140px",
            }}
          />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              data-testid="totp-verify-enable-button"
              onClick={confirmEnroll}
              disabled={busy || enrollCode.length < 6}
              style={{
                fontSize: "0.75rem", padding: "0.4rem 0.9rem", borderRadius: "5px",
                border: "none", background: "var(--brand-strong)", color: "var(--brand-strong-foreground)",
                fontWeight: 600, cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy ? "..." : t("settings.totp.verifyEnable")}
            </button>
            <button
              data-testid="totp-enroll-cancel-button"
              onClick={() => { setEnrolling(false); setQrDataUrl(""); setSecret(""); setEnrollCode(""); }}
              style={{
                fontSize: "0.75rem", padding: "0.4rem 0.9rem", borderRadius: "5px",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)", cursor: "pointer",
              }}
            >
              {t("settings.common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Idle states */}
      {!enrolling && !backupCodes && status && (
        <>
          {status.enabled ? (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {t("settings.totp.added", { date: status.createdAt ? fmt.date(status.createdAt) : "" })}
                {status.lastUsedAt && ` · ${t("settings.totp.lastUsed", { date: fmt.date(status.lastUsedAt) })}`}
                {" · "}{t("settings.totp.backupCodesLeft", { count: status.backupCodesRemaining ?? 0 })}
              </p>
              {confirmDisable ? (
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    data-testid="totp-disable-code-input"
                    type="text"
                    inputMode="numeric"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                    placeholder={t("settings.totp.currentCode")}
                    style={{
                      padding: "0.35rem 0.6rem", borderRadius: "5px",
                      border: "1px solid var(--border)", background: "var(--background)",
                      color: "var(--foreground)", fontSize: "0.8rem", width: "120px",
                    }}
                  />
                  <button
                    data-testid="totp-disable-button"
                    onClick={handleDisable}
                    disabled={busy}
                    style={{
                      fontSize: "0.7rem", padding: "0.3rem 0.7rem", borderRadius: "4px",
                      border: "none", background: "var(--destructive)", color: "#fff",
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {busy ? "..." : t("settings.totp.disable")}
                  </button>
                  <button
                    data-testid="totp-disable-cancel-button"
                    onClick={() => { setConfirmDisable(false); setDisableCode(""); }}
                    style={{
                      fontSize: "0.7rem", padding: "0.3rem 0.7rem", borderRadius: "4px",
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--foreground)", cursor: "pointer",
                    }}
                  >
                    {t("settings.common.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  data-testid="totp-disable-trigger-button"
                  onClick={() => setConfirmDisable(true)}
                  className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  {t("settings.totp.disable")}
                </button>
              )}
            </div>
          ) : (
            <button
              data-testid="totp-add-app-button"
              onClick={startEnroll}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              {busy ? "..." : t("settings.totp.addApp")}
            </button>
          )}
        </>
      )}

      {error && <p className="text-xs" style={{ color: "var(--destructive)" }}>{error}</p>}
    </div>
  );
}
