"use client";

/**
 * F59 — Passkeys management panel (Account → Security).
 *
 * Lists the current user's registered passkeys, lets them add a new one via
 * the browser WebAuthn prompt, and remove existing ones with the CMS's
 * standard inline confirm pattern.
 */

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  deviceType: string;
  backedUp: boolean;
}

function formatDate(iso?: string): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function PasskeysPanel() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/passkey", { credentials: "same-origin" });
      const data = (await res.json()) as { passkeys?: Passkey[] };
      setPasskeys(data.passkeys ?? []);
    } catch {
      setError("Could not load passkeys");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd() {
    setError("");
    setStatus("");
    setAdding(true);
    try {
      const optsRes = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
        credentials: "same-origin",
      });
      const options = await optsRes.json();
      if (!optsRes.ok) throw new Error((options as { error?: string }).error ?? "Failed to start registration");

      const attestation = await startRegistration({ optionsJSON: options });

      // Try to derive a friendly default name from the UA
      const ua = navigator.userAgent;
      let defaultName = "Passkey";
      if (/Mac/i.test(ua)) defaultName = "Mac";
      else if (/iPhone/i.test(ua)) defaultName = "iPhone";
      else if (/iPad/i.test(ua)) defaultName = "iPad";
      else if (/Android/i.test(ua)) defaultName = "Android";
      else if (/Windows/i.test(ua)) defaultName = "Windows";

      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: attestation, name: defaultName }),
      });
      const data = (await verifyRes.json()) as { error?: string };
      if (!verifyRes.ok) throw new Error(data.error ?? "Registration failed");
      setStatus("✓ Passkey added");
      setTimeout(() => setStatus(""), 2000);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration cancelled");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/auth/passkey/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Remove failed");
      }
      setConfirmId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
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
            Passkeys
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sign in with FaceID, TouchID, Windows Hello, or a hardware security key — no password needed.
          </p>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {passkeys.length} REGISTERED
        </span>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : passkeys.length === 0 ? (
        <p className="text-xs text-muted-foreground">No passkeys yet. Add one to enable passwordless login.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {passkeys.map((p) => (
            <li
              key={p.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "6px",
                fontSize: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span aria-hidden>🔑</span>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div style={{ color: "var(--muted-foreground)", fontSize: "0.68rem" }}>
                    Added {formatDate(p.createdAt)} · Last used {formatDate(p.lastUsedAt)}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {confirmId === p.id ? (
                  <>
                    <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                    <button
                      onClick={() => handleRemove(p.id)}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(p.id)}
                    style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer" }}
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={adding}
        className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-accent transition-colors cursor-pointer"
        style={{ cursor: adding ? "wait" : "pointer" }}
      >
        {adding ? "Waiting for device…" : "+ Add passkey"}
      </button>

      {status && <p className="text-xs" style={{ color: "hsl(140 60% 45%)" }}>{status}</p>}
      {error && <p className="text-xs" style={{ color: "var(--destructive)" }}>{error}</p>}
    </div>
  );
}
