"use client";

/**
 * F138-C — Beam Tokens panel in Account Preferences.
 *
 * A Beam token says "this CMS instance will receive ONE site within
 * the next hour". That's an instance-level capability, not a per-site
 * one — so token generation lives in Account Preferences, not Site
 * Settings. Critically: this panel works on an EMPTY CMS (no sites)
 * because the underlying API writes to the admin data dir, not a
 * site's _data/.
 *
 * Send-side Beam (push a site to a remote CMS) stays in Site Settings —
 * you can only send a site you have.
 */

import { useEffect, useState } from "react";
import { Key, Copy, Check, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n-context";

interface BeamToken {
  token: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  label?: string;
}

export function BeamTokensPanel() {
  const t = useT();
  const [tokens, setTokens] = useState<BeamToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newToken, setNewToken] = useState<{ token: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/beam/token");
      const data = await r.json();
      if (Array.isArray(data?.tokens)) setTokens(data.tokens);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("misc.beamTokens.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setNewToken(null);
    setCopied(false);
    try {
      const r = await fetch("/api/admin/beam/token", { method: "POST" });
      const data = await r.json();
      if (!r.ok || !data?.token) {
        setError(data?.error ?? t("misc.beamTokens.generateFailed"));
        return;
      }
      setNewToken({ token: data.token, expiresAt: data.expiresAt });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("misc.beamTokens.generateFailed"));
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore — fallback would be a manual select-all
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }} id="beam-tokens">
      <div>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.35rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Key style={{ width: 16, height: 16 }} /> {t("misc.beamTokens.title")}
        </h3>
        <p style={{ fontSize: "0.825rem", color: "var(--muted-foreground)", margin: 0, maxWidth: "60ch" }}>
          {t("misc.beamTokens.intro")}
        </p>
      </div>

      {newToken && (
        <div style={{
          padding: "0.85rem 1rem", borderRadius: "8px",
          background: "color-mix(in srgb, var(--primary) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--primary) 35%, transparent)",
          display: "flex", flexDirection: "column", gap: "0.6rem",
        }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>{t("misc.beamTokens.newToken")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <code style={{
              flex: 1, padding: "0.5rem 0.75rem", borderRadius: "6px",
              background: "var(--background)", border: "1px solid var(--border)",
              fontSize: "0.72rem", fontFamily: "ui-monospace, monospace",
              overflow: "auto", whiteSpace: "nowrap",
            }}>{newToken.token}</code>
            <button
              data-testid="beam-token-copy"
              type="button"
              onClick={copy}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0.45rem 0.7rem", borderRadius: "6px",
                border: "1px solid var(--border)", background: "var(--background)",
                fontSize: "0.78rem", cursor: "pointer",
              }}
            >
              {copied ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
              {copied ? t("misc.beamTokens.copied") : t("misc.beamTokens.copy")}
            </button>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
            {t("misc.beamTokens.expiresAt", { date: new Date(newToken.expiresAt).toLocaleString() })}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: "0.7rem 0.9rem", borderRadius: "8px",
          background: "color-mix(in srgb, var(--destructive) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--destructive) 35%, transparent)",
          fontSize: "0.8rem",
        }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          data-testid="beam-token-generate"
          type="button"
          onClick={generate}
          disabled={generating}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            padding: "0.5rem 0.9rem", borderRadius: "6px",
            border: "none", background: "var(--primary)", color: "var(--primary-foreground)",
            fontSize: "0.82rem", fontWeight: 600,
            cursor: generating ? "default" : "pointer",
            opacity: generating ? 0.6 : 1,
          }}
        >
          <Key style={{ width: 14, height: 14 }} />
          {generating ? t("misc.beamTokens.generating") : t("misc.beamTokens.generate")}
        </button>
        <button
          data-testid="beam-token-refresh"
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            padding: "0.5rem 0.9rem", borderRadius: "6px",
            border: "1px solid var(--border)", background: "transparent",
            fontSize: "0.82rem", cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw style={{ width: 14, height: 14 }} />
          {t("misc.beamTokens.refresh")}
        </button>
      </div>

      <div>
        <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          {t("misc.beamTokens.active")} {tokens.length > 0 && <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>({tokens.length})</span>}
        </div>
        {loading ? (
          <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>{t("misc.beamTokens.loading")}</div>
        ) : tokens.length === 0 ? (
          <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>{t("misc.beamTokens.none")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {tokens.map((tok) => (
              <div key={tok.token} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.5rem 0.7rem", borderRadius: "6px",
                background: "var(--card)", border: "1px solid var(--border)",
                fontSize: "0.75rem", fontFamily: "ui-monospace, monospace",
              }}>
                <code>{tok.token}</code>
                <span style={{ color: "var(--muted-foreground)", fontFamily: "system-ui, sans-serif" }}>
                  {t("misc.beamTokens.expiresLower", { date: new Date(tok.expiresAt).toLocaleString() })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
