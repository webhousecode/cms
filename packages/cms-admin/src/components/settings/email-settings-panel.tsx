"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { Check, Send, AlertCircle, ExternalLink, Mail } from "lucide-react";
import { SettingsCard } from "./settings-card";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { useT } from "@/lib/i18n-context";

interface EmailConfig {
  resendApiKey: string;
  emailFrom: string;
  emailFromName: string;
}

function maskKey(key: string): string {
  if (!key || key.length < 10) return key;
  return key.slice(0, 7) + "…" + key.slice(-4);
}

export function EmailSettingsPanel() {
  const t = useT();
  const brand = useBrand();
  const [config, setConfig] = useState<EmailConfig>({
    resendApiKey: "",
    emailFrom: "",
    emailFromName: brand.name,
  });
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Test email
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setConfig({
            resendApiKey: data.resendApiKey || "",
            emailFrom: data.emailFrom || "",
            emailFromName: data.emailFromName || brand.name,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [brand.name]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const patch: Record<string, string> = {};
    // Only send edited fields
    if ("resendApiKey" in editing) patch.resendApiKey = editing.resendApiKey!;
    if ("emailFrom" in editing) patch.emailFrom = editing.emailFrom!;
    if ("emailFromName" in editing) patch.emailFromName = editing.emailFromName!;
    // Always send non-key fields from current config
    if (!("emailFrom" in editing)) patch.emailFrom = config.emailFrom;
    if (!("emailFromName" in editing)) patch.emailFromName = config.emailFromName;
    if ("resendApiKey" in editing) patch.resendApiKey = editing.resendApiKey!;

    const res = await fetch("/api/admin/site-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setError(t("settings.common.saveFailed"));
    } else {
      const data = await res.json();
      setConfig({
        resendApiKey: data.resendApiKey || "",
        emailFrom: data.emailFrom || "",
        emailFromName: data.emailFromName || brand.name,
      });
      setEditing({});
      setSaved(true);
      toast.success(t("settings.email.saved"));
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
    window.dispatchEvent(new CustomEvent("cms:settings-saved"));
  }

  const emailFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    function onSave() { emailFormRef.current?.requestSubmit(); }
    window.addEventListener("cms:settings-save", onSave);
    return () => window.removeEventListener("cms:settings-save", onSave);
  }, []);

  async function handleTest() {
    if (!testEmail.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail.trim() }),
      });
      const data = await res.json();
      setTestResult({
        ok: res.ok,
        message: res.ok ? t("settings.email.testSentMessage") : data.error ?? t("settings.email.failedToSend"),
      });
      if (res.ok) {
        toast.success(t("settings.email.testSent"));
      } else {
        toast.error(t("settings.email.testFailed"));
      }
    } catch {
      setTestResult({ ok: false, message: t("settings.email.networkError") });
      toast.error(t("settings.email.testFailed"));
    } finally {
      setTesting(false);
    }
  }

  const fieldStyle = {
    padding: "0.5rem 0.75rem",
    borderRadius: "7px",
    border: "1px solid var(--border)",
    background: "var(--background)",
    color: "var(--foreground)",
    fontSize: "0.8rem",
    fontFamily: "monospace",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  if (loading) {
    return <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>{t("settings.common.loading")}</p>;
  }

  const FIELDS = [
    {
      id: "resendApiKey",
      label: t("settings.email.resendKey"),
      placeholder: "re_…",
      docsUrl: "https://resend.com/api-keys",
      docsLabel: t("settings.common.getKey"),
      type: "secret",
    },
    {
      id: "emailFrom",
      label: t("settings.email.senderEmail"),
      placeholder: t("settings.email.senderEmailPlaceholder"),
      docsUrl: "https://resend.com/domains",
      docsLabel: t("settings.email.domains"),
      type: "text",
    },
    {
      id: "emailFromName",
      label: t("settings.email.senderName"),
      placeholder: brand.name,
      type: "text",
    },
  ] as const;

  return (
    <form data-testid="panel-email" ref={emailFormRef} onSubmit={handleSave} onChange={() => window.dispatchEvent(new CustomEvent("cms:settings-dirty"))}>
      <SettingsCard>
        {FIELDS.map((f) => {
          const currentValue = config[f.id as keyof EmailConfig];
          const isEditing = f.id in editing;
          const hasValue = !!currentValue;
          const displayValue = f.type === "secret" && hasValue ? maskKey(currentValue) : currentValue;

          return (
            <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{f.label}</label>
                {hasValue && !isEditing && f.type === "secret" && (
                  <span style={{
                    fontSize: "0.65rem", fontFamily: "monospace",
                    padding: "0.1rem 0.4rem", borderRadius: "4px",
                    background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                    color: "var(--primary)",
                  }}>{t("settings.common.configured")}</span>
                )}
                {"docsUrl" in f && f.docsUrl && (
                  <a
                    data-testid={`email-docs-${f.id}`}
                    href={f.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: "0.2rem", marginLeft: "auto" }}
                  >
                    {f.docsLabel} <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} />
                  </a>
                )}
              </div>
              {isEditing ? (
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  <input
                    data-testid={`email-field-${f.id}`}
                    type={f.type === "secret" ? "text" : "text"}
                    value={editing[f.id] ?? ""}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [f.id]: e.target.value }))}
                    placeholder={f.placeholder}
                    autoFocus
                    style={{ ...fieldStyle, flex: 1 }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                  />
                  <button
                    data-testid={`email-cancel-${f.id}`}
                    type="button"
                    onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[f.id]; return n; })}
                    style={{ padding: "0.5rem 0.625rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}
                  >
                    {t("settings.common.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  data-testid={`email-edit-${f.id}`}
                  type="button"
                  onClick={() => setEditing((prev) => ({ ...prev, [f.id]: "" }))}
                  style={{
                    ...fieldStyle,
                    textAlign: "left",
                    cursor: "pointer",
                    color: "var(--muted-foreground)",
                    opacity: hasValue ? 1 : 0.6,
                  }}
                >
                  {hasValue ? displayValue : t("settings.email.clickToSet", { label: f.label })}
                </button>
              )}
            </div>
          );
        })}
      {error && (
        <p style={{ fontSize: "0.8rem", color: "var(--destructive)", marginBottom: "0.75rem" }}>{error}</p>
      )}


      <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
        {t("settings.email.storageNote").split(/(\{file\}|\{env\})/).map((part, i) =>
          part === "{file}" ? <code key={i} style={{ fontSize: "0.7rem" }}>_data/site-config.json</code>
          : part === "{env}" ? <code key={i} style={{ fontSize: "0.7rem" }}>RESEND_API_KEY</code>
          : part)}
      </p>
      </SettingsCard>

      {/* Test email */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem", marginTop: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("settings.email.sendTestEmail")}</label>
        </div>
        <div style={{ display: "flex", gap: "0.375rem" }}>
          <input
            data-testid="email-test-input"
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder={t("settings.email.testPlaceholder")}
            style={{ ...fieldStyle, flex: 1 }}
            onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          />
          <button
            data-testid="email-test-button"
            type="button"
            onClick={handleTest}
            disabled={testing || !testEmail.trim()}
            style={{
              padding: "0.5rem 0.875rem", borderRadius: "7px",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--muted-foreground)", fontSize: "0.8rem",
              cursor: testing ? "wait" : "pointer",
              display: "flex", alignItems: "center", gap: "0.3rem",
            }}
          >
            <Send style={{ width: "0.75rem", height: "0.75rem" }} />
            {testing ? t("settings.email.sending") : t("settings.email.sendTest")}
          </button>
        </div>
        {testResult && (
          <div
            style={{
              marginTop: "0.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.75rem",
              color: testResult.ok ? "var(--chart-2, #22c55e)" : "var(--destructive)",
            }}
          >
            {testResult.ok ? <Check style={{ width: 14, height: 14 }} /> : <AlertCircle style={{ width: 14, height: 14 }} />}
            {testResult.message}
          </div>
        )}
      </div>
    </form>
  );
}
