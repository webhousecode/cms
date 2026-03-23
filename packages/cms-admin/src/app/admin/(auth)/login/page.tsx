"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasGitHub, setHasGitHub] = useState(true); // always show — GitHub OAuth is part of the platform

  // If no users exist yet, redirect to setup. Also check if GitHub OAuth is configured.
  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d: { hasUsers?: boolean; hasGitHub?: boolean }) => {
        if (!d.hasUsers) router.replace("/admin/setup");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  // Check for GitHub OAuth error in URL
  useEffect(() => {
    const ghError = params.get("error");
    if (ghError === "no_github_email") setError("GitHub account has no verified email — use email/password login");
    else if (ghError === "github_csrf") setError("GitHub login failed (CSRF) — try again");
    else if (ghError === "github_api_failed") setError("Could not reach GitHub — try again");
    else if (ghError === "github_token_failed") setError("GitHub token exchange failed — try again");
  }, [params]);

  if (checking) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "hsl(0 0% 6%)",
      }}>
        <p style={{ color: "hsl(0 0% 40%)", fontSize: "0.875rem" }}>Loading…</p>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        setLoading(false);
        return;
      }
      // Verify cookie was stored before navigating
      const me = await fetch("/api/auth/me", { credentials: "same-origin" });
      const meData = (await me.json()) as { user?: { id: string } | null };
      if (!meData.user) {
        setError("Cookie was not stored — try a different browser or check privacy settings");
        setLoading(false);
        return;
      }
      // Full page load — ensures all client components get fresh auth state
      window.location.href = from;
    } catch {
      setError("Network error — try again");
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 200,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, hsl(0 0% 5%) 0%, hsl(0 0% 10%) 50%, hsl(35 20% 10%) 100%)",
      overflow: "hidden",
    }}>
      {/* Subtle grid pattern */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "radial-gradient(circle at 1px 1px, hsl(0 0% 20% / 0.3) 1px, transparent 0)",
        backgroundSize: "32px 32px",
        pointerEvents: "none",
      }} />

      {/* Glow accent */}
      <div style={{
        position: "absolute",
        top: "-20%",
        right: "-10%",
        width: "600px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, hsl(38 92% 50% / 0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: "100%",
          maxWidth: "380px",
          padding: "2rem",
          background: "hsl(0 0% 8% / 0.8)",
          backdropFilter: "blur(12px)",
          border: "1px solid hsl(0 0% 18%)",
          borderRadius: "16px",
          boxShadow: "0 16px 64px rgba(0,0,0,0.4), 0 0 0 1px hsl(0 0% 15%)",
        }}>
          <div style={{ marginBottom: "1.75rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
            <img src="/webhouse.app-dark-icon.svg" alt="" style={{ width: "72px", height: "72px", marginBottom: "0.25rem" }} />
            <img src="/webhouse-wordmark-dark.svg" alt="webhouse.app" style={{ height: "28px", width: "auto" }} />
            <p style={{ fontSize: "0.8rem", color: "hsl(0 0% 50%)", margin: 0 }}>Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "hsl(0 0% 70%)" }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@example.com"
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "7px",
                  border: "1px solid hsl(0 0% 20%)",
                  background: "hsl(0 0% 10%)",
                  color: "#fff",
                  fontSize: "0.875rem",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.target.style.borderColor = "hsl(38 92% 50%)"; }}
                onBlur={(e) => { e.target.style.borderColor = "hsl(0 0% 20%)"; }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "hsl(0 0% 70%)" }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "7px",
                  border: "1px solid hsl(0 0% 20%)",
                  background: "hsl(0 0% 10%)",
                  color: "#fff",
                  fontSize: "0.875rem",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.target.style.borderColor = "hsl(38 92% 50%)"; }}
                onBlur={(e) => { e.target.style.borderColor = "hsl(0 0% 20%)"; }}
              />
            </div>

            {error && (
              <p style={{
                fontSize: "0.8rem",
                color: "hsl(0 70% 60%)",
                background: "hsl(0 50% 15% / 0.5)",
                padding: "0.5rem 0.75rem",
                borderRadius: "6px",
                margin: 0,
              }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.6rem",
                borderRadius: "7px",
                border: "none",
                background: loading ? "hsl(0 0% 25%)" : "hsl(38 92% 50%)",
                color: loading ? "hsl(0 0% 50%)" : "hsl(38 30% 10%)",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: loading ? "wait" : "pointer",
                marginTop: "0.25rem",
                transition: "opacity 150ms",
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {hasGitHub && (
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                margin: "1.25rem 0 0.25rem",
              }}>
                <div style={{ flex: 1, height: "1px", background: "hsl(0 0% 20%)" }} />
                <span style={{ fontSize: "0.7rem", color: "hsl(0 0% 40%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>or</span>
                <div style={{ flex: 1, height: "1px", background: "hsl(0 0% 20%)" }} />
              </div>
              <a
                href={`/api/auth/github?login=true`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  width: "100%", padding: "0.55rem", marginTop: "0.25rem",
                  borderRadius: "7px", border: "1px solid hsl(0 0% 20%)",
                  background: "hsl(0 0% 10%)", color: "hsl(0 0% 85%)",
                  fontSize: "0.875rem", fontWeight: 500, textDecoration: "none",
                  cursor: "pointer", transition: "border-color 150ms, color 150ms",
                  boxSizing: "border-box",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "hsl(0 0% 40%)"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "hsl(0 0% 20%)"; e.currentTarget.style.color = "hsl(0 0% 85%)"; }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
                Sign in with GitHub
              </a>
            </>
          )}
        </div>
        <p style={{ marginTop: "1.5rem", fontSize: "0.7rem", color: "hsl(0 0% 30%)", letterSpacing: "0.05em" }}>
          Powered by <span style={{ color: "hsl(38 80% 55%)", fontWeight: 500 }}>@webhouse/cms</span>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
