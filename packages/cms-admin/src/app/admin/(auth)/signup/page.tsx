"use client";

import { useState, FormEvent } from "react";
import { Suspense } from "react";

/* ── Shared input style (matches login page) ── */
const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderRadius: "7px",
  border: "1px solid hsl(0 0% 20%)",
  background: "hsl(0 0% 10%)",
  color: "#fff",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 500,
  color: "hsl(0 0% 70%)",
};

const fieldGap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

/* ── Card-select for site type ── */
const siteTypes = [
  { value: "blog", label: "Blog / Docs", icon: "📝" },
  { value: "portfolio", label: "Portfolio", icon: "🎨" },
  { value: "business", label: "Business site", icon: "🏢" },
  { value: "ecommerce", label: "E-commerce", icon: "🛒" },
  { value: "other", label: "Something else", icon: "✨" },
];

const experienceLevels = [
  { value: "non-technical", label: "Non-technical" },
  { value: "somewhat", label: "Somewhat technical" },
  { value: "developer", label: "Developer" },
];

function focusGold(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "hsl(38 92% 50%)";
}
function blurReset(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "hsl(0 0% 20%)";
}

function SignupForm() {
  const [step, setStep] = useState<1 | 2 | "done">(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [projectName, setProjectName] = useState("");
  const [siteType, setSiteType] = useState("");
  const [experience, setExperience] = useState("");
  const [description, setDescription] = useState("");

  function handleStep1(e: FormEvent) {
    e.preventDefault();
    setStep(2);
  }

  function handleStep2(e: FormEvent) {
    e.preventDefault();
    // Dev/test — no backend call
    setStep("done");
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
      overflow: "auto",
    }}>
      {/* Grid pattern */}
      <div style={{
        position: "fixed",
        inset: 0,
        backgroundImage: "radial-gradient(circle at 1px 1px, hsl(0 0% 20% / 0.3) 1px, transparent 0)",
        backgroundSize: "32px 32px",
        pointerEvents: "none",
      }} />
      {/* Glow */}
      <div style={{
        position: "fixed",
        top: "-20%",
        right: "-10%",
        width: "600px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, hsl(38 92% 50% / 0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "2rem 1rem",
        width: "100%",
        maxWidth: "420px",
      }}>
        <div style={{
          width: "100%",
          padding: "2rem",
          background: "hsl(0 0% 8% / 0.8)",
          backdropFilter: "blur(12px)",
          border: "1px solid hsl(0 0% 18%)",
          borderRadius: "16px",
          boxShadow: "0 16px 64px rgba(0,0,0,0.4), 0 0 0 1px hsl(0 0% 15%)",
        }}>
          {/* Header */}
          <div style={{ marginBottom: "1.75rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
            <img src="/webhouse.app-dark-icon.svg" alt="" style={{ width: "72px", height: "72px", marginBottom: "0.25rem" }} />
            <img src="/webhouse-wordmark-dark.svg" alt="webhouse.app" style={{ height: "28px", width: "auto" }} />
            {step !== "done" && (
              <p style={{ fontSize: "0.8rem", color: "hsl(0 0% 50%)", margin: 0 }}>
                {step === 1 ? "Create your account" : "Personalize your AI"}
              </p>
            )}
          </div>

          {/* Step indicator */}
          {step !== "done" && (
            <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginBottom: "1.25rem" }}>
              <div style={{
                width: "32px", height: "3px", borderRadius: "2px",
                background: "hsl(38 92% 50%)",
              }} />
              <div style={{
                width: "32px", height: "3px", borderRadius: "2px",
                background: step === 2 ? "hsl(38 92% 50%)" : "hsl(0 0% 20%)",
                transition: "background 0.3s",
              }} />
            </div>
          )}

          {/* ── STEP 1: Account ── */}
          {step === 1 && (
            <form onSubmit={handleStep1} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div style={fieldGap}>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@company.com"
                  style={inputStyle}
                  onFocus={focusGold}
                  onBlur={blurReset}
                />
              </div>

              <div style={fieldGap}>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  style={inputStyle}
                  onFocus={focusGold}
                  onBlur={blurReset}
                />
              </div>

              <div style={fieldGap}>
                <label style={labelStyle}>Project name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  required
                  placeholder="My portfolio, Acme blog..."
                  style={inputStyle}
                  onFocus={focusGold}
                  onBlur={blurReset}
                />
              </div>

              <button type="submit" style={{
                padding: "0.6rem",
                borderRadius: "7px",
                border: "none",
                background: "hsl(38 92% 50%)",
                color: "hsl(38 30% 10%)",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                marginTop: "0.25rem",
              }}>
                Continue
              </button>

              <p style={{ textAlign: "center", fontSize: "0.8rem", color: "hsl(0 0% 45%)", margin: 0 }}>
                Already have an account?{" "}
                <a href="/login" style={{ color: "hsl(38 80% 55%)", textDecoration: "none" }}>Sign in</a>
              </p>
            </form>
          )}

          {/* ── STEP 2: Personalize ── */}
          {step === 2 && (
            <form onSubmit={handleStep2} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Site type — card select */}
              <div style={fieldGap}>
                <label style={labelStyle}>What are you building?</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {siteTypes.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSiteType(t.value)}
                      style={{
                        padding: "0.5rem 0.6rem",
                        borderRadius: "8px",
                        border: siteType === t.value
                          ? "1px solid hsl(38 92% 50%)"
                          : "1px solid hsl(0 0% 20%)",
                        background: siteType === t.value
                          ? "hsl(38 92% 50% / 0.08)"
                          : "hsl(0 0% 10%)",
                        color: siteType === t.value ? "hsl(38 92% 80%)" : "hsl(0 0% 70%)",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.15s",
                        textAlign: "left",
                      }}
                    >
                      <span>{t.icon}</span> {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Experience level — pill selector */}
              <div style={fieldGap}>
                <label style={labelStyle}>How technical are you?</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {experienceLevels.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setExperience(l.value)}
                      style={{
                        flex: 1,
                        padding: "0.45rem 0.5rem",
                        borderRadius: "7px",
                        border: experience === l.value
                          ? "1px solid hsl(38 92% 50%)"
                          : "1px solid hsl(0 0% 20%)",
                        background: experience === l.value
                          ? "hsl(38 92% 50% / 0.08)"
                          : "hsl(0 0% 10%)",
                        color: experience === l.value ? "hsl(38 92% 80%)" : "hsl(0 0% 60%)",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Freeform description */}
              <div style={fieldGap}>
                <label style={labelStyle}>
                  Describe your site in a sentence{" "}
                  <span style={{ color: "hsl(0 0% 35%)" }}>(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A photography portfolio with a blog and contact page"
                  rows={2}
                  style={{
                    ...inputStyle,
                    resize: "none",
                    fontFamily: "inherit",
                  }}
                  onFocus={focusGold as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
                  onBlur={blurReset as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
                />
                <p style={{ fontSize: "0.7rem", color: "hsl(0 0% 35%)", margin: 0, lineHeight: 1.4 }}>
                  This becomes the seed prompt for your AI — it will generate your schema and initial content from this.
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    padding: "0.6rem 1rem",
                    borderRadius: "7px",
                    border: "1px solid hsl(0 0% 20%)",
                    background: "transparent",
                    color: "hsl(0 0% 60%)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  Back
                </button>
                <button type="submit" style={{
                  flex: 1,
                  padding: "0.6rem",
                  borderRadius: "7px",
                  border: "none",
                  background: "hsl(38 92% 50%)",
                  color: "hsl(38 30% 10%)",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}>
                  Create account
                </button>
              </div>
            </form>
          )}

          {/* ── DONE ── */}
          {step === "done" && (
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "hsl(38 92% 50% / 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
                fontSize: "1.5rem",
              }}>
                ✓
              </div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fafafa", marginBottom: "0.5rem" }}>
                You&apos;re on the list
              </h2>
              <p style={{ fontSize: "0.85rem", color: "hsl(0 0% 50%)", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                webhouse.app is in active development. We&apos;ll notify you at{" "}
                <span style={{ color: "hsl(38 80% 55%)" }}>{email}</span>{" "}
                when your account is ready.
              </p>
              <a
                href="/"
                style={{
                  display: "inline-block",
                  padding: "0.5rem 1.5rem",
                  borderRadius: "7px",
                  border: "1px solid hsl(0 0% 20%)",
                  color: "hsl(0 0% 70%)",
                  textDecoration: "none",
                  fontSize: "0.85rem",
                }}
              >
                ← Back to home
              </a>
            </div>
          )}
        </div>

        <p style={{ marginTop: "1.5rem", fontSize: "0.7rem", color: "hsl(0 0% 30%)", letterSpacing: "0.05em" }}>
          Powered by <span style={{ color: "hsl(38 80% 55%)", fontWeight: 500 }}>@webhouse/cms</span>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
