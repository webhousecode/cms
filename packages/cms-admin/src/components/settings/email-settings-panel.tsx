"use client";

import { useState, useEffect, FormEvent } from "react";
import { Check, Send, AlertCircle, ExternalLink, Mail } from "lucide-react";
import { toast } from "sonner";

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
  const [config, setConfig] = useState<EmailConfig>({
    resendApiKey: "",
    emailFrom: "",
    emailFromName: "webhouse.app",
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
            emailFromName: data.emailFromName || "webhouse.app",
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
      setError("Save failed");
    } else {
      const data = await res.json();
      setConfig({
        resendApiKey: data.resendApiKey || "",
        emailFrom: data.emailFrom || "",
        emailFromName: data.emailFromName || "webhouse.app",
      });
      setEditing({});
      setSaved(true);
      toast.success("Email settings saved");
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

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
        message: res.ok ? "Test email sent!" : data.error ?? "Failed to send",
      });
      if (res.ok) {
        toast.success("Test email sent");
      } else {
        toast.error("Failed to send test email");
      }
    } catch {
      setTestResult({ ok: false, message: "Network error" });
      toast.error("Failed to send test email");
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
    return <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Loading…</p>;
  }

  const FIELDS = [
    {
      id: "resendApiKey",
      label: "Resend API key",
      placeholder: "re_…",
      docsUrl: "https://resend.com/api-keys",
      docsLabel: "Get key",
      type: "secret",
    },
    {
      id: "emailFrom",
      label: "Sender email",
      placeholder: "noreply@yourdomain.com",
      docsUrl: "https://resend.com/domains",
      docsLabel: "Domains",
      type: "text",
    },
    {
      id: "emailFromName",
      label: "Sender name",
      placeholder: "webhouse.app",
      type: "text",
    },
  ] as const;

  return (
    <form onSubmit={handleSave}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
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
                  }}>configured</span>
                )}
                {"docsUrl" in f && f.docsUrl && (
                  <a
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
                    type="button"
                    onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[f.id]; return n; })}
                    style={{ padding: "0.5rem 0.625rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
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
                  {hasValue ? displayValue : `Click to set ${f.label}…`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p style={{ fontSize: "0.8rem", color: "var(--destructive)", marginBottom: "0.75rem" }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        style={{
          display: "flex", alignItems: "center", gap: "0.375rem",
          padding: "0.5rem 1rem", borderRadius: "7px", border: "none",
          background: saved ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "var(--primary)",
          color: saved ? "var(--primary)" : "var(--primary-foreground)",
          fontSize: "0.875rem", fontWeight: 600, cursor: saving ? "wait" : "pointer",
          transition: "all 200ms",
        }}
      >
        {saved
          ? <><Check style={{ width: "0.9rem", height: "0.9rem" }} /> Saved</>
          : saving ? "Saving…" : <><Mail style={{ width: "0.9rem", height: "0.9rem" }} /> Save email settings</>
        }
      </button>

      <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.75rem" }}>
        Keys are stored in <code style={{ fontSize: "0.7rem" }}>_data/site-config.json</code>. Falls back to <code style={{ fontSize: "0.7rem" }}>RESEND_API_KEY</code> env var.
      </p>

      {/* Test email */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem", marginTop: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Send test email</label>
        </div>
        <div style={{ display: "flex", gap: "0.375rem" }}>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="your@email.com"
            style={{ ...fieldStyle, flex: 1 }}
            onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          />
          <button
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
            {testing ? "Sending…" : "Send test"}
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
