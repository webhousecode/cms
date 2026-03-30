"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { CustomSelect } from "@/components/ui/custom-select";
import { SettingsCard } from "./settings-card";
import { WebhookList, type WebhookEntry } from "./webhook-list";
interface BackupConfig {
  backupSchedule: "off" | "daily" | "weekly";
  backupTime: string;
  backupRetentionDays: number;
  backupWebhooks: WebhookEntry[];
  backupProvider: "off" | "pcloud" | "s3" | "webdav";
  backupPcloudEmail: string;
  backupPcloudPassword: string;
  backupPcloudEu: boolean;
}

const DEFAULTS: BackupConfig = {
  backupSchedule: "off",
  backupTime: "03:00",
  backupRetentionDays: 30,
  backupWebhooks: [],
  backupProvider: "off",
  backupPcloudEmail: "",
  backupPcloudPassword: "",
  backupPcloudEu: true,
};

export function BackupSettingsPanel() {
  const [config, setConfig] = useState<BackupConfig>(DEFAULTS);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  function updateConfig(fn: (c: BackupConfig) => BackupConfig) {
    setConfig(fn);
    window.dispatchEvent(new CustomEvent("cms:settings-dirty"));
  }

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setConfig({
          backupSchedule: data.backupSchedule ?? "off",
          backupTime: data.backupTime ?? "03:00",
          backupRetentionDays: data.backupRetentionDays ?? 30,
          backupWebhooks: data.backupWebhooks ?? [],
          backupProvider: data.backupProvider ?? "off",
          backupPcloudEmail: data.backupPcloudEmail ?? "",
          backupPcloudPassword: data.backupPcloudPassword ?? "",
          backupPcloudEu: data.backupPcloudEu ?? true,
        });
      })
      .catch(() => {});
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await fetch("/api/admin/site-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      window.dispatchEvent(new CustomEvent("cms:settings-saved"));
    } catch { /* handled by ActionBar */ }
  }, [config]);

  useEffect(() => {
    function onSave() { handleSave(); }
    window.addEventListener("cms:settings-save", onSave);
    return () => window.removeEventListener("cms:settings-save", onSave);
  }, [handleSave]);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body: Record<string, unknown> = { type: config.backupProvider };
      if (config.backupProvider === "pcloud") {
        body.pcloud = {
          email: config.backupPcloudEmail,
          password: config.backupPcloudPassword,
          euRegion: config.backupPcloudEu,
        };
      }
      const res = await fetch("/api/admin/backup-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, message: "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  const scheduleOptions = [
    { value: "off", label: "Off" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly (Mondays)" },
  ];

  const retentionOptions = [
    { value: "7", label: "7 days" },
    { value: "14", label: "14 days" },
    { value: "30", label: "30 days" },
    { value: "60", label: "60 days" },
    { value: "90", label: "90 days" },
  ];

  const providerOptions = [
    { value: "off", label: "Local only" },
    { value: "pcloud", label: "pCloud (10 GB free, EU)" },
  ];

  const labelStyle = { display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem" } as const;
  const descStyle = { fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 } as const;
  const webhookLabel = { display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem", marginTop: "0.75rem" } as const;
  const inputStyle = {
    width: "100%", padding: "0.4rem 0.6rem", borderRadius: "0.375rem",
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", fontSize: "0.8125rem",
  } as const;

  return (
    <div data-testid="panel-backup">
      {/* ── Schedule ─────────────────────────────────────── */}
      <SectionHeading>Schedule</SectionHeading>
      <SettingsCard>
        <p style={descStyle}>
          Automatic backups of all content and site data. Scheduled backups appear in the Calendar.
        </p>

        <div>
          <label style={labelStyle}>Frequency</label>
          <CustomSelect
            value={config.backupSchedule}
            onChange={(v) => updateConfig((c) => ({ ...c, backupSchedule: v as BackupConfig["backupSchedule"] }))}
            options={scheduleOptions}
          />
        </div>

        {config.backupSchedule !== "off" && (
          <>
            <div>
              <label style={labelStyle}>Time</label>
              <input
                type="time"
                value={config.backupTime}
                onChange={(e) => updateConfig((c) => ({ ...c, backupTime: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Retention</label>
              <CustomSelect
                value={String(config.backupRetentionDays)}
                onChange={(v) => updateConfig((c) => ({ ...c, backupRetentionDays: parseInt(v, 10) }))}
                options={retentionOptions}
              />
            </div>
          </>
        )}
      </SettingsCard>

      {/* ── Cloud Destination ────────────────────────────── */}
      <SectionHeading>Cloud Destination</SectionHeading>
      <SettingsCard>
        <p style={descStyle}>
          Backups are always stored locally. Optionally upload a copy to a cloud provider for off-site redundancy.
        </p>

        <div>
          <label style={labelStyle}>Provider</label>
          <CustomSelect
            value={config.backupProvider}
            onChange={(v) => {
              updateConfig((c) => ({ ...c, backupProvider: v as BackupConfig["backupProvider"] }));
              setTestResult(null);
            }}
            options={providerOptions}
          />
        </div>

        {config.backupProvider === "pcloud" && (
          <>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={config.backupPcloudEmail}
                onChange={(e) => updateConfig((c) => ({ ...c, backupPcloudEmail: e.target.value }))}
                placeholder="Your pCloud email"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={config.backupPcloudPassword}
                onChange={(e) => updateConfig((c) => ({ ...c, backupPcloudPassword: e.target.value }))}
                placeholder="Your pCloud password"
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
              <input
                type="checkbox"
                checked={config.backupPcloudEu}
                onChange={(e) => updateConfig((c) => ({ ...c, backupPcloudEu: e.target.checked }))}
                style={{ accentColor: "var(--primary)" }}
              />
              <label style={{ fontSize: "0.75rem" }}>EU region (Luxembourg — GDPR compliant)</label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={testConnection}
                disabled={testing || !config.backupPcloudEmail || !config.backupPcloudPassword}
                style={{
                  fontSize: "0.75rem", padding: "0.35rem 0.75rem", borderRadius: "6px",
                  border: "1px solid var(--border)", background: "var(--card)",
                  color: "var(--foreground)", cursor: testing || !config.backupPcloudEmail || !config.backupPcloudPassword ? "not-allowed" : "pointer",
                  opacity: testing || !config.backupPcloudEmail || !config.backupPcloudPassword ? 0.5 : 1,
                }}
              >
                {testing ? "Testing..." : "Test connection"}
              </button>

              {testResult && (
                <span style={{
                  fontSize: "0.72rem",
                  color: testResult.ok ? "#4ade80" : "var(--destructive)",
                  fontWeight: 500,
                }}>
                  {testResult.ok ? "✓ " : "✕ "}{testResult.message}
                </span>
              )}
            </div>
          </>
        )}
      </SettingsCard>

      {/* ── Webhooks ─────────────────────────────────────── */}
      <SectionHeading>Notifications</SectionHeading>
      <SettingsCard>
        <label style={webhookLabel}>Webhooks</label>
        <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: "-0.5rem 0 0" }}>
          Called in order when a backup completes. Discord, Slack, or any URL that accepts JSON POST.
        </p>
        <WebhookList
          webhooks={config.backupWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, backupWebhooks: w }))}
        />
      </SettingsCard>
    </div>
  );
}
