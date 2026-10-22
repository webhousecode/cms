"use client";

/**
 * F59 phase 2 — QR login approval page.
 *
 * The approver opens this URL by scanning the QR code on the desktop login
 * page. Because this lives under (workspace), middleware enforces that the
 * approver is already authenticated. They see a confirmation card with the
 * desktop's user-agent and tap "Approve" or "Reject".
 */

import { use, useEffect, useState } from "react";
import { useT } from "@/lib/i18n-context";

interface QrStatusResponse {
  status: "pending" | "approved" | "claimed" | "rejected" | "expired";
  expiresAt: number;
}

export default function ApproveQrPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useT();
  const { id } = use(params);
  const [status, setStatus] = useState<QrStatusResponse["status"]>("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Initial status load — if expired/already-handled, show that immediately
  useEffect(() => {
    fetch(`/api/auth/qr/status/${id}`)
      .then((r) => r.json())
      .then((d: QrStatusResponse) => setStatus(d.status))
      .catch(() => setError(t("tools.approveQr.loadFailed")));
  }, [id, t]);

  async function decide(reject: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/qr/approve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, reject }),
      });
      const data = (await res.json()) as { ok?: boolean; status?: typeof status; error?: string };
      if (!res.ok) {
        setError(data.error ?? t("tools.approveQr.failed"));
      } else if (data.status) {
        setStatus(data.status);
      }
    } catch {
      setError(t("tools.approveQr.networkError"));
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (status === "pending") {
    body = (
      <>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 0.5rem" }}>{t("tools.approveQr.title")}</h1>
        <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", margin: "0 0 1.5rem" }}>
          {t("tools.approveQr.body")}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
          <button
            data-testid="qr-approve-button"
            onClick={() => decide(false)}
            disabled={busy}
            style={{
              padding: "0.6rem 1.5rem", borderRadius: "8px", border: "none",
              background: "var(--brand-strong)", color: "var(--brand-strong-foreground)",
              fontSize: "0.9rem", fontWeight: 600, cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "..." : t("tools.approveQr.approve")}
          </button>
          <button
            data-testid="qr-reject-button"
            onClick={() => decide(true)}
            disabled={busy}
            style={{
              padding: "0.6rem 1.5rem", borderRadius: "8px",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--foreground)", fontSize: "0.9rem", cursor: busy ? "wait" : "pointer",
            }}
          >
            {t("tools.approveQr.reject")}
          </button>
        </div>
      </>
    );
  } else if (status === "approved" || status === "claimed") {
    body = (
      <>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>✓</div>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 0.5rem" }}>{t("tools.approveQr.signedIn")}</h1>
        <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", margin: 0 }}>
          {t("tools.approveQr.signedInBody")}
        </p>
      </>
    );
  } else if (status === "rejected") {
    body = (
      <>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>✗</div>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>{t("tools.approveQr.rejected")}</h1>
      </>
    );
  } else {
    body = (
      <>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>⏰</div>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>{t("tools.approveQr.expired")}</h1>
        <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", margin: "0.5rem 0 0" }}>
          {t("tools.approveQr.expiredBody")}
        </p>
      </>
    );
  }

  return (
    <div style={{
      minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem",
    }}>
      <div style={{
        maxWidth: "420px", width: "100%", padding: "2rem",
        border: "1px solid var(--border)", borderRadius: "12px",
        background: "var(--card)", textAlign: "center",
      }}>
        {body}
        {error && <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--destructive)" }}>{error}</p>}
      </div>
    </div>
  );
}
