"use client";
import { PoweredBy } from "@/components/powered-by";
import { useBrand } from "@/lib/brand-context";
import { BrandLogo } from "@/components/brand-logo";

import { useState, FormEvent } from "react";
import { Suspense } from "react";
import { useT } from "@/lib/i18n-context";

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
  { value: "blog", label: "auth.signup.typeBlog", icon: "📝" },
  { value: "portfolio", label: "auth.signup.typePortfolio", icon: "🎨" },
  { value: "business", label: "auth.signup.typeBusiness", icon: "🏢" },
  { value: "ecommerce", label: "auth.signup.typeEcommerce", icon: "🛒" },
  { value: "other", label: "auth.signup.typeOther", icon: "✨" },
];

const experienceLevels = [
  { value: "non-technical", label: "auth.signup.expNonTechnical" },
  { value: "somewhat", label: "auth.signup.expSomewhat" },
  { value: "developer", label: "auth.signup.expDeveloper" },
];

function focusGold(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--brand-strong)";
}
function blurReset(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "hsl(0 0% 20%)";
}

function SignupForm() {
  const brand = useBrand();
  const t = useT();
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
    <div
      data-testid="signup-root"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, hsl(0 0% 5%) 0%, hsl(0 0% 10%) 50%, var(--brand-tint-bg) 100%)",
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
        background: "radial-gradient(circle, color-mix(in srgb, var(--brand-strong) 6%, transparent) 0%, transparent 70%)",
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
            <BrandLogo variant="icon" light={false} style={{ width: "72px", height: "72px", marginBottom: "0.25rem" }} />
            <BrandLogo variant="wordmark" light={false} style={{ height: "28px", width: "auto" }} />
            {step !== "done" && (
              <p style={{ fontSize: "0.8rem", color: "hsl(0 0% 50%)", margin: 0 }}>
                {step === 1 ? t("auth.signup.step1Title") : t("auth.signup.step2Title")}
              </p>
            )}
          </div>

          {/* Step indicator */}
          {step !== "done" && (
            <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginBottom: "1.25rem" }}>
              <div style={{
                width: "32px", height: "3px", borderRadius: "2px",
                background: "var(--brand-strong)",
              }} />
              <div style={{
                width: "32px", height: "3px", borderRadius: "2px",
                background: step === 2 ? "var(--brand-strong)" : "hsl(0 0% 20%)",
                transition: "background 0.3s",
              }} />
            </div>
          )}

          {/* ── STEP 1: Account ── */}
          {step === 1 && (
            <form data-testid="signup-step1-form" onSubmit={handleStep1} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div style={fieldGap}>
                <label style={labelStyle}>{t("auth.signup.email")}</label>
                <input
                  data-testid="signup-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder={t("auth.signup.emailPlaceholder")}
                  style={inputStyle}
                  onFocus={focusGold}
                  onBlur={blurReset}
                />
              </div>

              <div style={fieldGap}>
                <label style={labelStyle}>{t("auth.signup.password")}</label>
                <input
                  data-testid="signup-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder={t("auth.signup.passwordPlaceholder")}
                  style={inputStyle}
                  onFocus={focusGold}
                  onBlur={blurReset}
                />
              </div>

              <div style={fieldGap}>
                <label style={labelStyle}>{t("auth.signup.projectName")}</label>
                <input
                  data-testid="signup-project-input"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  required
                  placeholder={t("auth.signup.projectNamePlaceholder")}
                  style={inputStyle}
                  onFocus={focusGold}
                  onBlur={blurReset}
                />
              </div>

              <button data-testid="signup-step1-submit" type="submit" style={{
                padding: "0.6rem",
                borderRadius: "7px",
                border: "none",
                background: "var(--brand-strong)",
                color: "var(--brand-strong-foreground)",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                marginTop: "0.25rem",
              }}>
                {t("auth.signup.continue")}
              </button>

              <p style={{ textAlign: "center", fontSize: "0.8rem", color: "hsl(0 0% 45%)", margin: 0 }}>
                {t("auth.signup.haveAccount")}{" "}
                <a data-testid="signup-login-link" href="/login" style={{ color: "var(--brand-on-dark)", textDecoration: "none" }}>{t("auth.signup.signIn")}</a>
              </p>
            </form>
          )}

          {/* ── STEP 2: Personalize ── */}
          {step === 2 && (
            <form data-testid="signup-step2-form" onSubmit={handleStep2} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Site type — card select */}
              <div style={fieldGap}>
                <label style={labelStyle}>{t("auth.signup.whatBuilding")}</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {siteTypes.map((st) => (
                    <button
                      data-testid={`signup-site-type-${st.value}`}
                      key={st.value}
                      type="button"
                      onClick={() => setSiteType(st.value)}
                      style={{
                        padding: "0.5rem 0.6rem",
                        borderRadius: "8px",
                        border: siteType === st.value
                          ? "1px solid var(--brand-strong)"
                          : "1px solid hsl(0 0% 20%)",
                        background: siteType === st.value
                          ? "color-mix(in srgb, var(--brand-strong) 8%, transparent)"
                          : "hsl(0 0% 10%)",
                        color: siteType === st.value ? "var(--brand-on-dark-soft)" : "hsl(0 0% 70%)",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.15s",
                        textAlign: "left",
                      }}
                    >
                      <span>{st.icon}</span> {t(st.label)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Experience level — pill selector */}
              <div style={fieldGap}>
                <label style={labelStyle}>{t("auth.signup.howTechnical")}</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {experienceLevels.map((l) => (
                    <button
                      data-testid={`signup-experience-${l.value}`}
                      key={l.value}
                      type="button"
                      onClick={() => setExperience(l.value)}
                      style={{
                        flex: 1,
                        padding: "0.45rem 0.5rem",
                        borderRadius: "7px",
                        border: experience === l.value
                          ? "1px solid var(--brand-strong)"
                          : "1px solid hsl(0 0% 20%)",
                        background: experience === l.value
                          ? "color-mix(in srgb, var(--brand-strong) 8%, transparent)"
                          : "hsl(0 0% 10%)",
                        color: experience === l.value ? "var(--brand-on-dark-soft)" : "hsl(0 0% 60%)",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t(l.label)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Freeform description */}
              <div style={fieldGap}>
                <label style={labelStyle}>
                  {t("auth.signup.describe")}{" "}
                  <span style={{ color: "hsl(0 0% 35%)" }}>{t("auth.signup.optional")}</span>
                </label>
                <textarea
                  data-testid="signup-description-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("auth.signup.describePlaceholder")}
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
                  {t("auth.signup.describeHint")}
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "0.25rem" }}>
                <button
                  data-testid="signup-step2-back"
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
                  {t("auth.signup.back")}
                </button>
                <button data-testid="signup-step2-submit" type="submit" style={{
                  flex: 1,
                  padding: "0.6rem",
                  borderRadius: "7px",
                  border: "none",
                  background: "var(--brand-strong)",
                  color: "var(--brand-strong-foreground)",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}>
                  {t("auth.signup.createAccount")}
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
                background: "color-mix(in srgb, var(--brand-strong) 10%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
                fontSize: "1.5rem",
              }}>
                ✓
              </div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fafafa", marginBottom: "0.5rem" }}>
                {t("auth.signup.onTheList")}
              </h2>
              <p style={{ fontSize: "0.85rem", color: "hsl(0 0% 50%)", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                {t("auth.signup.doneBody", { brand: brand.name }).split("{email}")[0]}
                <span style={{ color: "var(--brand-on-dark)" }}>{email}</span>
                {t("auth.signup.doneBody", { brand: brand.name }).split("{email}")[1]}
              </p>
              <a
                data-testid="signup-home-link"
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
                {t("auth.signup.backHome")}
              </a>
            </div>
          )}
        </div>

        <PoweredBy />
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
