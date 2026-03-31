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
  backupS3Provider: string;
  backupS3Endpoint: string;
  backupS3Region: string;
  backupS3Bucket: string;
  backupS3AccessKeyId: string;
  backupS3SecretAccessKey: string;
  backupS3Prefix: string;
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
  backupS3Provider: "",
  backupS3Endpoint: "",
  backupS3Region: "",
  backupS3Bucket: "",
  backupS3AccessKeyId: "",
  backupS3SecretAccessKey: "",
  backupS3Prefix: "cms-backups/",
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
          backupS3Provider: data.backupS3Provider ?? "",
          backupS3Endpoint: data.backupS3Endpoint ?? "",
          backupS3Region: data.backupS3Region ?? "",
          backupS3Bucket: data.backupS3Bucket ?? "",
          backupS3AccessKeyId: data.backupS3AccessKeyId ?? "",
          backupS3SecretAccessKey: data.backupS3SecretAccessKey ?? "",
          backupS3Prefix: data.backupS3Prefix ?? "cms-backups/",
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
      if (config.backupProvider === "s3") {
        body.s3 = {
          provider: config.backupS3Provider || "custom",
          endpoint: config.backupS3Endpoint,
          region: config.backupS3Region,
          bucket: config.backupS3Bucket,
          accessKeyId: config.backupS3AccessKeyId,
          secretAccessKey: config.backupS3SecretAccessKey,
          prefix: config.backupS3Prefix,
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
    { value: "s3", label: "S3-compatible (R2, B2, Scaleway, AWS)" },
  ];

  const s3PresetOptions = [
    { value: "r2", label: "Cloudflare R2 (10 GB free)" },
    { value: "scaleway", label: "Scaleway (75 GB free, EU)" },
    { value: "b2", label: "Backblaze B2 (10 GB free)" },
    { value: "hetzner", label: "Hetzner Object Storage (EU)" },
    { value: "s3", label: "AWS S3" },
    { value: "custom", label: "Custom S3-compatible" },
  ];

  const s3PresetDefaults: Record<string, { endpoint: string; region: string }> = {
    scaleway: { endpoint: "https://s3.fr-par.scw.cloud", region: "fr-par" },
    b2: { endpoint: "", region: "eu-central-003" },
    hetzner: { endpoint: "https://fsn1.your-objectstorage.com", region: "fsn1" },
    s3: { endpoint: "", region: "eu-north-1" },
  };

  const applyS3Preset = (preset: string) => {
    const defaults = s3PresetDefaults[preset];
    updateConfig((c) => ({
      ...c,
      backupS3Provider: preset,
      ...(defaults ? { backupS3Endpoint: defaults.endpoint, backupS3Region: defaults.region } : {}),
    }));
  };

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

        {config.backupProvider === "s3" && (
          <>
            <div>
              <label style={labelStyle}>Provider</label>
              <CustomSelect
                value={config.backupS3Provider || "r2"}
                onChange={(v) => applyS3Preset(v)}
                options={s3PresetOptions}
              />
            </div>

            {(config.backupS3Provider === "r2" || !config.backupS3Provider) && (
              <div>
                <label style={labelStyle}>Endpoint</label>
                <input
                  type="text"
                  value={config.backupS3Endpoint}
                  onChange={(e) => updateConfig((c) => ({ ...c, backupS3Endpoint: e.target.value }))}
                  placeholder="https://<account-id>.r2.cloudflarestorage.com"
                  style={inputStyle}
                />
                <p style={{ ...descStyle, marginTop: "0.25rem" }}>
                  Find your Account ID in Cloudflare dashboard → R2 → Overview
                </p>
              </div>
            )}

            {config.backupS3Provider === "b2" && (
              <div>
                <label style={labelStyle}>Endpoint</label>
                <input
                  type="text"
                  value={config.backupS3Endpoint}
                  onChange={(e) => updateConfig((c) => ({ ...c, backupS3Endpoint: e.target.value }))}
                  placeholder="https://s3.eu-central-003.backblazeb2.com"
                  style={inputStyle}
                />
              </div>
            )}

            {config.backupS3Provider === "custom" && (
              <>
                <div>
                  <label style={labelStyle}>Endpoint</label>
                  <input
                    type="text"
                    value={config.backupS3Endpoint}
                    onChange={(e) => updateConfig((c) => ({ ...c, backupS3Endpoint: e.target.value }))}
                    placeholder="https://s3.example.com"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Region</label>
                  <input
                    type="text"
                    value={config.backupS3Region}
                    onChange={(e) => updateConfig((c) => ({ ...c, backupS3Region: e.target.value }))}
                    placeholder="eu-west-1"
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            <div>
              <label style={labelStyle}>Bucket</label>
              <input
                type="text"
                value={config.backupS3Bucket}
                onChange={(e) => updateConfig((c) => ({ ...c, backupS3Bucket: e.target.value }))}
                placeholder="cms-backups"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Access Key ID</label>
              <input
                type="text"
                value={config.backupS3AccessKeyId}
                onChange={(e) => updateConfig((c) => ({ ...c, backupS3AccessKeyId: e.target.value }))}
                placeholder="Access key ID"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Secret Access Key</label>
              <input
                type="password"
                value={config.backupS3SecretAccessKey}
                onChange={(e) => updateConfig((c) => ({ ...c, backupS3SecretAccessKey: e.target.value }))}
                placeholder="Secret access key"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Prefix (folder)</label>
              <input
                type="text"
                value={config.backupS3Prefix}
                onChange={(e) => updateConfig((c) => ({ ...c, backupS3Prefix: e.target.value }))}
                placeholder="cms-backups/"
                style={{ ...inputStyle, fontFamily: "monospace" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={testConnection}
                disabled={testing || !config.backupS3Bucket || !config.backupS3AccessKeyId || !config.backupS3SecretAccessKey}
                style={{
                  fontSize: "0.75rem", padding: "0.35rem 0.75rem", borderRadius: "6px",
                  border: "1px solid var(--border)", background: "var(--card)",
                  color: "var(--foreground)",
                  cursor: testing || !config.backupS3Bucket ? "not-allowed" : "pointer",
                  opacity: testing || !config.backupS3Bucket ? 0.5 : 1,
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
