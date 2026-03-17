"use client";

import { useState, useEffect, FormEvent } from "react";
import { useParams } from "next/navigation";

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "accepted">("loading");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/invitations/validate?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.email) {
          setInviteEmail(data.email);
          setInviteRole(data.role);
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create account");
        setSubmitting(false);
        return;
      }
      setStatus("accepted");
      // Redirect to admin after short delay
      setTimeout(() => {
        window.location.href = "/admin";
      }, 1500);
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  }

  const inputStyle = {
    padding: "0.5rem 0.75rem",
    borderRadius: "7px",
    border: "1px solid hsl(0 0% 20%)",
    background: "hsl(0 0% 10%)",
    color: "#fff",
    fontSize: "0.875rem",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  };

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
      {/* Grid pattern */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "radial-gradient(circle at 1px 1px, hsl(0 0% 20% / 0.3) 1px, transparent 0)",
        backgroundSize: "32px 32px",
        pointerEvents: "none",
      }} />

      {/* Glow */}
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
          </div>

          {status === "loading" && (
            <p style={{ textAlign: "center", fontSize: "0.875rem", color: "hsl(0 0% 50%)" }}>
              Validating invitation...
            </p>
          )}

          {status === "invalid" && (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "0.875rem", color: "hsl(0 70% 60%)", marginBottom: "1rem" }}>
                This invitation link is invalid or has expired.
              </p>
              <a
                href="/admin/login"
                style={{ fontSize: "0.8rem", color: "hsl(38 80% 55%)", textDecoration: "none" }}
              >
                Go to login
              </a>
            </div>
          )}

          {status === "accepted" && (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "0.875rem", color: "hsl(140 60% 50%)" }}>
                Account created! Redirecting...
              </p>
            </div>
          )}

          {status === "valid" && (
            <>
              <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                <p style={{ fontSize: "0.8rem", color: "hsl(0 0% 50%)", margin: 0 }}>
                  You&apos;ve been invited as
                </p>
                <span style={{
                  display: "inline-block",
                  marginTop: "0.35rem",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "9999px",
                  background: "hsl(38 92% 50% / 0.15)",
                  color: "hsl(38 80% 55%)",
                }}>
                  {inviteRole}
                </span>
                <p style={{ fontSize: "0.75rem", color: "hsl(0 0% 40%)", margin: "0.5rem 0 0" }}>
                  {inviteEmail}
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "hsl(0 0% 70%)" }}>Your name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    placeholder="Jane Smith"
                    style={inputStyle}
                    onFocus={(e) => { e.target.style.borderColor = "hsl(38 92% 50%)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "hsl(0 0% 20%)"; }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "hsl(0 0% 70%)" }}>Choose a password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Min. 8 characters"
                    style={inputStyle}
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
                  disabled={submitting}
                  style={{
                    padding: "0.6rem",
                    borderRadius: "7px",
                    border: "none",
                    background: submitting ? "hsl(0 0% 25%)" : "hsl(38 92% 50%)",
                    color: submitting ? "hsl(0 0% 50%)" : "hsl(38 30% 10%)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: submitting ? "wait" : "pointer",
                    marginTop: "0.25rem",
                    transition: "opacity 150ms",
                  }}
                >
                  {submitting ? "Creating account..." : "Create account"}
                </button>
              </form>
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
