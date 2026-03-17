"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, Send, AlertCircle } from "lucide-react";

interface EmailConfig {
  resendApiKey: string;
  emailFrom: string;
  emailFromName: string;
}

export function EmailSettingsPanel() {
  const [config, setConfig] = useState<EmailConfig>({
    resendApiKey: "",
    emailFrom: "",
    emailFromName: "webhouse.app",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    fetch("/api/cms/site-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setConfig({
            resendApiKey: data.config.resendApiKey || "",
            emailFrom: data.config.emailFrom || "",
            emailFromName: data.config.emailFromName || "webhouse.app",
          });
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/cms/site-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
    } catch {
      setTestResult({ ok: false, message: "Network error" });
    } finally {
      setTesting(false);
    }
  }

  const inputStyle = {
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    background: "var(--input)",
    color: "var(--foreground)",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* API Key */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <label className="text-sm font-medium text-foreground">Resend API Key</label>
        <input
          type="password"
          value={config.resendApiKey}
          onChange={(e) => setConfig({ ...config, resendApiKey: e.target.value })}
          placeholder="re_..."
          style={inputStyle}
        />
        <p className="text-xs text-muted-foreground">
          Get your API key from{" "}
          <a href="https://resend.com/api-keys" target="_blank" rel="noopener" style={{ color: "var(--primary)" }}>
            resend.com/api-keys
          </a>
          . Falls back to RESEND_API_KEY env var.
        </p>
      </div>

      {/* From email */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <label className="text-sm font-medium text-foreground">Sender email</label>
        <input
          type="email"
          value={config.emailFrom}
          onChange={(e) => setConfig({ ...config, emailFrom: e.target.value })}
          placeholder="noreply@yourdomain.com"
          style={inputStyle}
        />
        <p className="text-xs text-muted-foreground">
          Must be a verified domain in Resend. Defaults to noreply@webhouse.app.
        </p>
      </div>

      {/* From name */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <label className="text-sm font-medium text-foreground">Sender name</label>
        <input
          type="text"
          value={config.emailFromName}
          onChange={(e) => setConfig({ ...config, emailFromName: e.target.value })}
          placeholder="webhouse.app"
          style={inputStyle}
        />
      </div>

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} size="sm" className="w-fit gap-1.5">
        {saved ? <Check className="w-3.5 h-3.5" /> : null}
        {saving ? "Saving..." : saved ? "Saved" : "Save email settings"}
      </Button>

      {/* Test email */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
        <label className="text-sm font-medium text-foreground" style={{ display: "block", marginBottom: "0.5rem" }}>
          Send test email
        </label>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="your@email.com"
            style={{ ...inputStyle, flex: 1 }}
          />
          <Button onClick={handleTest} disabled={testing || !testEmail.trim()} size="sm" variant="outline" className="gap-1.5">
            <Send className="w-3.5 h-3.5" />
            {testing ? "Sending..." : "Send test"}
          </Button>
        </div>
        {testResult && (
          <div
            style={{
              marginTop: "0.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.8rem",
              color: testResult.ok ? "var(--chart-2, #22c55e)" : "var(--destructive)",
            }}
          >
            {testResult.ok ? <Check style={{ width: 14, height: 14 }} /> : <AlertCircle style={{ width: 14, height: 14 }} />}
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
}
