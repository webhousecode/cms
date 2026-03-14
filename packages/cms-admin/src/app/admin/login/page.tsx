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

  // If no users exist yet, redirect to setup
  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d: { hasUsers?: boolean }) => {
        if (!d.hasUsers) router.replace("/admin/setup");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        setLoading(false);
        return;
      }
      router.push(from);
      router.refresh();
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
          <div style={{ marginBottom: "1.75rem", textAlign: "center" }}>
            <img src="/cms-logo-icon.svg" alt="CMS" style={{ width: "48px", height: "48px", marginBottom: "0.75rem" }} />
            <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem", color: "#fff" }}>CMS Admin</h1>
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
