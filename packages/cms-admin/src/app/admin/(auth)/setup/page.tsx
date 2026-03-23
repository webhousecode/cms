"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d: { hasUsers?: boolean }) => {
        if (d.hasUsers) router.replace("/admin/login");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Setup failed");
        setLoading(false);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Network error — try again");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--background)" }}>
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Checking setup status…</p>
      </div>
    );
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
          <p style={{ fontSize: "0.8rem", color: "hsl(0 0% 50%)", margin: 0 }}>Create your admin account to get started</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "hsl(0 0% 70%)" }}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Your name"
              style={{ padding: "0.5rem 0.75rem", borderRadius: "7px", border: "1px solid hsl(0 0% 20%)", background: "hsl(0 0% 10%)", color: "#fff", fontSize: "0.875rem", outline: "none", width: "100%", boxSizing: "border-box" }}
              onFocus={(e) => { e.target.style.borderColor = "hsl(38 92% 50%)"; }}
              onBlur={(e) => { e.target.style.borderColor = "hsl(0 0% 20%)"; }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "hsl(0 0% 70%)" }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@example.com"
              style={{ padding: "0.5rem 0.75rem", borderRadius: "7px", border: "1px solid hsl(0 0% 20%)", background: "hsl(0 0% 10%)", color: "#fff", fontSize: "0.875rem", outline: "none", width: "100%", boxSizing: "border-box" }}
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
              minLength={8}
              placeholder="Min 8 characters"
              style={{ padding: "0.5rem 0.75rem", borderRadius: "7px", border: "1px solid hsl(0 0% 20%)", background: "hsl(0 0% 10%)", color: "#fff", fontSize: "0.875rem", outline: "none", width: "100%", boxSizing: "border-box" }}
              onFocus={(e) => { e.target.style.borderColor = "hsl(38 92% 50%)"; }}
              onBlur={(e) => { e.target.style.borderColor = "hsl(0 0% 20%)"; }}
            />
          </div>

          {error && (
            <p style={{ fontSize: "0.8rem", color: "var(--destructive)", background: "color-mix(in srgb, var(--destructive) 10%, transparent)", padding: "0.5rem 0.75rem", borderRadius: "6px", margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ padding: "0.6rem", borderRadius: "7px", border: "none", background: loading ? "hsl(0 0% 25%)" : "hsl(38 92% 50%)", color: loading ? "hsl(0 0% 50%)" : "hsl(38 30% 10%)", fontSize: "0.875rem", fontWeight: 600, cursor: loading ? "wait" : "pointer", marginTop: "0.25rem", transition: "opacity 150ms" }}
          >
            {loading ? "Creating account…" : "Create admin account"}
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
