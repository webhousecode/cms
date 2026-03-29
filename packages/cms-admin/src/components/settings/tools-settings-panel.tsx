"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { CustomSelect } from "@/components/ui/custom-select";
import { SettingsCard } from "./settings-card";
import { WebhookList, type WebhookEntry } from "./webhook-list";

interface AutomationConfig {
  backupSchedule: "off" | "daily" | "weekly";
  backupTime: string;
  backupRetentionDays: number;
  backupWebhooks: WebhookEntry[];
  linkCheckSchedule: "off" | "daily" | "weekly";
  linkCheckTime: string;
  linkCheckWebhooks: WebhookEntry[];
  publishWebhooks: WebhookEntry[];
  agentDefaultWebhooks: WebhookEntry[];
  aiImageOverwrite: "ask" | "skip" | "overwrite";
  mediaAutoOptimize: boolean;
  mediaVariantWidths: number[];
  mediaWebpQuality: number;
}

const DEFAULTS: AutomationConfig = {
  backupSchedule: "off",
  backupTime: "03:00",
  backupRetentionDays: 30,
  backupWebhooks: [],
  linkCheckSchedule: "off",
  linkCheckTime: "04:00",
  linkCheckWebhooks: [],
  publishWebhooks: [],
  agentDefaultWebhooks: [],
  aiImageOverwrite: "ask",
  mediaAutoOptimize: true,
  mediaVariantWidths: [400, 800, 1200, 1600],
  mediaWebpQuality: 80,
};

export function ToolsSettingsPanel() {
  const [config, setConfig] = useState<AutomationConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  function updateConfig(fn: (c: AutomationConfig) => AutomationConfig) {
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
          linkCheckSchedule: data.linkCheckSchedule ?? "off",
          linkCheckTime: data.linkCheckTime ?? "04:00",
          linkCheckWebhooks: data.linkCheckWebhooks ?? [],
          publishWebhooks: data.publishWebhooks ?? [],
          agentDefaultWebhooks: data.agentDefaultWebhooks ?? [],
          aiImageOverwrite: data.aiImageOverwrite ?? "ask",
          mediaAutoOptimize: data.mediaAutoOptimize ?? true,
          mediaVariantWidths: data.mediaVariantWidths ?? [400, 800, 1200, 1600],
          mediaWebpQuality: data.mediaWebpQuality ?? 80,
        });
      })
      .catch(() => {});
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/admin/site-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
      window.dispatchEvent(new CustomEvent("cms:settings-saved"));
    }
  }, [config]);

  // Listen for ActionBar save event
  useEffect(() => {
    function onSave() { handleSave(); }
    window.addEventListener("cms:settings-save", onSave);
    return () => window.removeEventListener("cms:settings-save", onSave);
  }, [handleSave]);

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

  const labelStyle = { display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem" } as const;
  const descStyle = { fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.25rem" } as const;
  const webhookLabel = { display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem", marginTop: "0.75rem" } as const;

  return (
    <div data-testid="panel-tools">
      {/* ── Backup ─────────────────────────────────────────── */}
      <SectionHeading>Backup</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
          Automatic backups of all content and site data. Scheduled backups appear in the Calendar.
        </p>

        <div>
          <label style={labelStyle}>Frequency</label>
          <CustomSelect
            value={config.backupSchedule}
            onChange={(v) => updateConfig((c) => ({ ...c, backupSchedule: v as AutomationConfig["backupSchedule"] }))}
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
                style={{
                  padding: "0.4rem 0.6rem", borderRadius: "0.375rem",
                  border: "1px solid var(--border)", background: "var(--background)",
                  color: "var(--foreground)", fontSize: "0.8125rem",
                }}
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

        <label style={webhookLabel}>Webhooks</label>
        <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: "-0.5rem 0 0" }}>
          Called in order when a backup completes. Discord, Slack, or any URL that accepts JSON POST.
        </p>
        <WebhookList
          webhooks={config.backupWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, backupWebhooks: w }))}
        />
      </SettingsCard>

      {/* ── Link Checker ───────────────────────────────────── */}
      <SectionHeading>Link Checker</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
          Automatic link checking across all content. Scheduled runs appear in the Calendar.
        </p>

        <div>
          <label style={labelStyle}>Frequency</label>
          <CustomSelect
            value={config.linkCheckSchedule}
            onChange={(v) => updateConfig((c) => ({ ...c, linkCheckSchedule: v as AutomationConfig["linkCheckSchedule"] }))}
            options={scheduleOptions}
          />
        </div>

        {config.linkCheckSchedule !== "off" && (
          <div>
            <label style={labelStyle}>Time</label>
            <input
              type="time"
              value={config.linkCheckTime}
              onChange={(e) => updateConfig((c) => ({ ...c, linkCheckTime: e.target.value }))}
              style={{
                padding: "0.4rem 0.6rem", borderRadius: "0.375rem",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.8125rem",
              }}
            />
          </div>
        )}

        <label style={webhookLabel}>Webhooks</label>
        <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: "-0.5rem 0 0" }}>
          Called in order when a link check completes.
        </p>
        <WebhookList
          webhooks={config.linkCheckWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, linkCheckWebhooks: w }))}
        />
      </SettingsCard>

      {/* ── Content Publishing ─────────────────────────────── */}
      <SectionHeading>Content Publishing</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
          Notified when content is auto-published or expired by the scheduler.
        </p>
        <WebhookList
          webhooks={config.publishWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, publishWebhooks: w }))}
        />
      </SettingsCard>

      {/* ── Default Agent Webhook ──────────────────────────── */}
      <SectionHeading>AI Agents (default)</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
          Default webhooks for all agents. Individual agents can override with their own webhooks.
        </p>
        <WebhookList
          webhooks={config.agentDefaultWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, agentDefaultWebhooks: w }))}
        />
      </SettingsCard>

      <SectionHeading>AI Image Analysis</SectionHeading>
      <SettingsCard>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.8rem", fontWeight: 500 }}>
            Batch overwrite behavior
          </label>
          <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
            When running &quot;Analyze All&quot;, how should already-analyzed images be handled?
          </p>
          <CustomSelect
            value={config.aiImageOverwrite}
            onChange={(v) => updateConfig((c) => ({ ...c, aiImageOverwrite: v as AutomationConfig["aiImageOverwrite"] }))}
            options={[
              { value: "ask", label: "Ask each time" },
              { value: "skip", label: "Skip already analyzed" },
              { value: "overwrite", label: "Always re-analyze" },
            ]}
          />
        </div>
      </SettingsCard>

      <SectionHeading>Media Processing</SectionHeading>
      <SettingsCard>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <input
              type="checkbox"
              checked={config.mediaAutoOptimize}
              onChange={(e) => updateConfig((c) => ({ ...c, mediaAutoOptimize: e.target.checked }))}
              style={{ accentColor: "var(--primary)" }}
            />
            <div>
              <label style={{ fontSize: "0.8rem", fontWeight: 500 }}>Generate WebP variants on upload</label>
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
                Automatically create optimized WebP variants when images are uploaded
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 500 }}>Variant widths (px)</label>
            <input
              type="text"
              value={config.mediaVariantWidths.join(", ")}
              onChange={(e) => {
                const widths = e.target.value
                  .split(",")
                  .map((s) => parseInt(s.trim(), 10))
                  .filter((n) => !isNaN(n) && n > 0)
                  .sort((a, b) => a - b);
                if (widths.length > 0) {
                  updateConfig((c) => ({ ...c, mediaVariantWidths: widths }));
                }
              }}
              placeholder="400, 800, 1200, 1600"
              style={{
                padding: "0.375rem 0.5rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "var(--card)",
                fontSize: "0.8rem",
                color: "var(--foreground)",
                fontFamily: "monospace",
              }}
            />
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
              Comma-separated pixel widths. Variants larger than the original are skipped.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              WebP quality: {config.mediaWebpQuality}
            </label>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={config.mediaWebpQuality}
              onChange={(e) => updateConfig((c) => ({ ...c, mediaWebpQuality: parseInt(e.target.value, 10) }))}
              style={{ accentColor: "var(--primary)" }}
            />
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
              Higher = better quality, larger files. 80 is recommended.
            </p>
          </div>
        </div>
      </SettingsCard>

    </div>
  );
}
