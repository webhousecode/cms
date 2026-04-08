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

interface Status {
  enabled: boolean;
  createdAt?: string;
  lastUsedAt?: string;
  backupCodesRemaining?: number;
}

export function TotpPanel() {
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
      setError("Could not load status");
    }
  }

  useEffect(() => { void load(); }, []);

  async function startEnroll() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/totp/enroll/start", { method: "POST", credentials: "same-origin" });
      const data = (await res.json()) as { qrDataUrl?: string; secret?: string; error?: string };
      if (!res.ok || !data.qrDataUrl) throw new Error(data.error ?? "Failed");
      setQrDataUrl(data.qrDataUrl);
      setSecret(data.secret ?? "");
      setEnrolling(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
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
      if (!res.ok || !data.backupCodes) throw new Error(data.error ?? "Verification failed");
      setBackupCodes(data.backupCodes);
      setEnrolling(false);
      setQrDataUrl("");
      setSecret("");
      setEnrollCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
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
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setConfirmDisable(false);
      setDisableCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
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
            Authenticator app
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use Microsoft Authenticator, Google Authenticator, Authy, 1Password, or any other RFC 6238 app for two-factor sign-in.
          </p>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {status?.enabled ? "ENABLED" : "DISABLED"}
        </span>
      </div>

      {/* Backup codes display (post-enrollment) */}
      {backupCodes && (
        <div style={{ padding: "0.75rem", border: "1px solid hsl(38 92% 50% / 0.3)", borderRadius: "6px", background: "hsl(38 92% 50% / 0.05)" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 600, margin: "0 0 0.5rem", color: "hsl(38 92% 50%)" }}>
            Save these backup codes
          </p>
          <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: "0 0 0.75rem" }}>
            Each code works once. Use them if you lose access to your authenticator app. They will not be shown again.
          </p>
          <pre style={{
            fontFamily: "ui-monospace, monospace", fontSize: "0.85rem", margin: 0,
            padding: "0.5rem", background: "var(--muted)", borderRadius: "4px",
            color: "var(--foreground)", whiteSpace: "pre-wrap",
          }}>
            {backupCodes.join("\n")}
          </pre>
          <button
            onClick={() => setBackupCodes(null)}
            style={{
              marginTop: "0.5rem", fontSize: "0.7rem", padding: "0.25rem 0.6rem",
              borderRadius: "4px", border: "1px solid var(--border)",
              background: "transparent", color: "var(--foreground)", cursor: "pointer",
            }}
          >
            I've saved them
          </button>
        </div>
      )}

      {/* Enrollment */}
      {enrolling && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0, textAlign: "center" }}>
            Scan with your authenticator app, then enter the 6-digit code below.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="TOTP QR" style={{ width: "180px", height: "180px", background: "#fff", borderRadius: "6px" }} />
          {secret && (
            <details style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
              <summary style={{ cursor: "pointer" }}>Can&apos;t scan? Enter manually</summary>
              <code style={{ display: "block", marginTop: "0.4rem", padding: "0.4rem", background: "var(--muted)", borderRadius: "4px", wordBreak: "break-all" }}>
                {secret}
              </code>
            </details>
          )}
          <input
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
              onClick={confirmEnroll}
              disabled={busy || enrollCode.length < 6}
              style={{
                fontSize: "0.75rem", padding: "0.4rem 0.9rem", borderRadius: "5px",
                border: "none", background: "hsl(38 92% 50%)", color: "hsl(38 30% 10%)",
                fontWeight: 600, cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy ? "..." : "Verify & enable"}
            </button>
            <button
              onClick={() => { setEnrolling(false); setQrDataUrl(""); setSecret(""); setEnrollCode(""); }}
              style={{
                fontSize: "0.75rem", padding: "0.4rem 0.9rem", borderRadius: "5px",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)", cursor: "pointer",
              }}
            >
              Cancel
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
                Added {status.createdAt ? new Date(status.createdAt).toLocaleDateString() : ""}
                {status.lastUsedAt && ` · last used ${new Date(status.lastUsedAt).toLocaleDateString()}`}
                {" · "}{status.backupCodesRemaining ?? 0} backup codes left
              </p>
              {confirmDisable ? (
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                    placeholder="Current code"
                    style={{
                      padding: "0.35rem 0.6rem", borderRadius: "5px",
                      border: "1px solid var(--border)", background: "var(--background)",
                      color: "var(--foreground)", fontSize: "0.8rem", width: "120px",
                    }}
                  />
                  <button
                    onClick={handleDisable}
                    disabled={busy}
                    style={{
                      fontSize: "0.7rem", padding: "0.3rem 0.7rem", borderRadius: "4px",
                      border: "none", background: "var(--destructive)", color: "#fff",
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {busy ? "..." : "Disable"}
                  </button>
                  <button
                    onClick={() => { setConfirmDisable(false); setDisableCode(""); }}
                    style={{
                      fontSize: "0.7rem", padding: "0.3rem 0.7rem", borderRadius: "4px",
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--foreground)", cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDisable(true)}
                  className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  Disable
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={startEnroll}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              {busy ? "..." : "Add new app"}
            </button>
          )}
        </>
      )}

      {error && <p className="text-xs" style={{ color: "var(--destructive)" }}>{error}</p>}
    </div>
  );
}
