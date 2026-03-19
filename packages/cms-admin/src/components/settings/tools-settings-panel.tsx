"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { CustomSelect } from "@/components/ui/custom-select";
import { SettingsCard } from "./settings-card";
import { WebhookList, type WebhookEntry } from "./webhook-list";

type DeployProvider = "off" | "vercel" | "netlify" | "flyio" | "cloudflare" | "github-pages" | "custom";

interface AutomationConfig {
  deployProvider: DeployProvider;
  deployHookUrl: string;
  deployApiToken: string;
  deployAppName: string;
  backupSchedule: "off" | "daily" | "weekly";
  backupTime: string;
  backupRetentionDays: number;
  backupWebhooks: WebhookEntry[];
  linkCheckSchedule: "off" | "daily" | "weekly";
  linkCheckTime: string;
  linkCheckWebhooks: WebhookEntry[];
  publishWebhooks: WebhookEntry[];
  agentDefaultWebhooks: WebhookEntry[];
}

const DEFAULTS: AutomationConfig = {
  deployProvider: "off",
  deployHookUrl: "",
  deployApiToken: "",
  deployAppName: "",
  backupSchedule: "off",
  backupTime: "03:00",
  backupRetentionDays: 30,
  backupWebhooks: [],
  linkCheckSchedule: "off",
  linkCheckTime: "04:00",
  linkCheckWebhooks: [],
  publishWebhooks: [],
  agentDefaultWebhooks: [],
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
          deployProvider: data.deployProvider ?? "off",
          deployHookUrl: data.deployHookUrl ?? "",
          deployApiToken: data.deployApiToken ?? "",
          deployAppName: data.deployAppName ?? "",
          backupSchedule: data.backupSchedule ?? "off",
          backupTime: data.backupTime ?? "03:00",
          backupRetentionDays: data.backupRetentionDays ?? 30,
          backupWebhooks: data.backupWebhooks ?? [],
          linkCheckSchedule: data.linkCheckSchedule ?? "off",
          linkCheckTime: data.linkCheckTime ?? "04:00",
          linkCheckWebhooks: data.linkCheckWebhooks ?? [],
          publishWebhooks: data.publishWebhooks ?? [],
          agentDefaultWebhooks: data.agentDefaultWebhooks ?? [],
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

  const deployProviders = [
    { value: "off", label: "Off" },
    { value: "vercel", label: "Vercel" },
    { value: "netlify", label: "Netlify" },
    { value: "flyio", label: "Fly.io" },
    { value: "cloudflare", label: "Cloudflare Pages" },
    { value: "github-pages", label: "GitHub Pages" },
    { value: "custom", label: "Custom webhook" },
  ];

  const needsHookUrl = ["vercel", "netlify", "cloudflare", "custom"].includes(config.deployProvider);
  const needsToken = ["flyio", "github-pages"].includes(config.deployProvider);
  const needsAppName = ["flyio", "github-pages"].includes(config.deployProvider);

  return (
    <div>
      {/* ── Deploy ──────────────────────────────────────────── */}
      <SectionHeading first>Deploy</SectionHeading>
      <SettingsCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0, flex: 1 }}>
            One-click deploy to your hosting provider. The deploy button appears in the header when configured.
          </p>
          <a
            href="https://webhouse.app/docs/deploy"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.6rem", color: "var(--muted-foreground)", display: "flex",
              alignItems: "center", gap: "0.2rem", flexShrink: 0, marginLeft: "0.5rem",
              textDecoration: "none", padding: "0.15rem 0.4rem", borderRadius: "4px",
              border: "1px solid var(--border)",
            }}
          >
            Docs
          </a>
        </div>

        <div>
          <label style={labelStyle}>Provider</label>
          <CustomSelect
            value={config.deployProvider}
            onChange={(v) => updateConfig((c) => ({ ...c, deployProvider: v as DeployProvider }))}
            options={deployProviders}
          />
          {config.deployProvider !== "off" && (
            <p style={{
              fontSize: "0.65rem", margin: "0.35rem 0 0", padding: "0.3rem 0.5rem",
              borderRadius: "4px", lineHeight: 1.4,
              background: config.deployProvider === "github-pages"
                ? "color-mix(in srgb, var(--destructive) 8%, transparent)"
                : "color-mix(in srgb, var(--primary) 8%, transparent)",
              color: config.deployProvider === "github-pages" ? "var(--destructive)" : "var(--muted-foreground)",
            }}>
              {config.deployProvider === "vercel" && "Recommended for Next.js and static sites. Supports SSR, API routes, and edge functions."}
              {config.deployProvider === "netlify" && "Supports Next.js via adapter, static sites, and serverless functions."}
              {config.deployProvider === "flyio" && "Docker-based. Best for SSR apps (Next.js, Remix) and custom servers. Deploys to arn (Stockholm)."}
              {config.deployProvider === "cloudflare" && "Static sites and Workers. Limited SSR support — not recommended for full Next.js apps."}
              {config.deployProvider === "github-pages" && "Static files only. Not compatible with Next.js SSR, API routes, or server-side features."}
              {config.deployProvider === "custom" && "Any service that accepts a POST request to trigger a build."}
            </p>
          )}
        </div>

        {needsHookUrl && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Deploy hook URL</label>
            <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
              {config.deployProvider === "vercel" && "Vercel → Project → Settings → Git → Deploy Hooks"}
              {config.deployProvider === "netlify" && "Netlify → Site → Build & deploy → Build hooks"}
              {config.deployProvider === "cloudflare" && "Cloudflare → Pages → Settings → Builds → Deploy hooks"}
              {config.deployProvider === "custom" && "Any URL that accepts a POST request to trigger a build"}
            </p>
            <input
              type="url"
              value={config.deployHookUrl}
              onChange={(e) => updateConfig((c) => ({ ...c, deployHookUrl: e.target.value }))}
              placeholder="https://api.vercel.com/v1/integrations/deploy/..."
              style={{
                padding: "0.45rem 0.75rem", borderRadius: "7px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace",
                width: "100%", boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {needsToken && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>API Token</label>
            <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
              {config.deployProvider === "flyio" && "Fly.io → fly tokens create deploy"}
              {config.deployProvider === "github-pages" && "GitHub → Settings → Developer settings → Personal access tokens"}
            </p>
            <input
              type="password"
              value={config.deployApiToken}
              onChange={(e) => updateConfig((c) => ({ ...c, deployApiToken: e.target.value }))}
              placeholder="Token..."
              style={{
                padding: "0.45rem 0.75rem", borderRadius: "7px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.8rem",
                width: "100%", boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {needsAppName && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>
              {config.deployProvider === "flyio" ? "App name" : "Repository (owner/repo)"}
            </label>
            <input
              type="text"
              value={config.deployAppName}
              onChange={(e) => updateConfig((c) => ({ ...c, deployAppName: e.target.value }))}
              placeholder={config.deployProvider === "flyio" ? "my-app" : "owner/repo"}
              style={{
                padding: "0.45rem 0.75rem", borderRadius: "7px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace",
                width: "100%", boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Fly.io also accepts hook URL as alternative */}
        {config.deployProvider === "flyio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Or: Deploy hook URL (alternative)</label>
            <input
              type="url"
              value={config.deployHookUrl}
              onChange={(e) => updateConfig((c) => ({ ...c, deployHookUrl: e.target.value }))}
              placeholder="https://..."
              style={{
                padding: "0.45rem 0.75rem", borderRadius: "7px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace",
                width: "100%", boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </SettingsCard>

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

    </div>
  );
}
