"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomTimeInput } from "@/components/ui/custom-time-input";
import { CustomRangeSlider } from "@/components/ui/custom-range-slider";
import { SettingsCard } from "./settings-card";
import { WebhookList, type WebhookEntry } from "./webhook-list";
import { useT } from "@/lib/i18n-context";

interface AutomationConfig {
  linkCheckSchedule: "off" | "daily" | "weekly";
  linkCheckTime: string;
  linkCheckWebhooks: WebhookEntry[];
  publishWebhooks: WebhookEntry[];
  agentDefaultWebhooks: WebhookEntry[];
  contentWebhooks: WebhookEntry[];
  deployWebhooks: WebhookEntry[];
  mediaWebhooks: WebhookEntry[];
  aiImageOverwrite: "ask" | "skip" | "overwrite";
  mediaAutoOptimize: boolean;
  mediaVariantWidths: number[];
  mediaWebpQuality: number;
}

const DEFAULTS: AutomationConfig = {
  linkCheckSchedule: "off",
  linkCheckTime: "04:00",
  linkCheckWebhooks: [],
  publishWebhooks: [],
  agentDefaultWebhooks: [],
  contentWebhooks: [],
  deployWebhooks: [],
  mediaWebhooks: [],
  aiImageOverwrite: "ask",
  mediaAutoOptimize: true,
  mediaVariantWidths: [400, 800, 1200, 1600],
  mediaWebpQuality: 80,
};

export function ToolsSettingsPanel() {
  const t = useT();
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
          linkCheckSchedule: data.linkCheckSchedule ?? "off",
          linkCheckTime: data.linkCheckTime ?? "04:00",
          linkCheckWebhooks: data.linkCheckWebhooks ?? [],
          publishWebhooks: data.publishWebhooks ?? [],
          agentDefaultWebhooks: data.agentDefaultWebhooks ?? [],
          contentWebhooks: data.contentWebhooks ?? [],
          deployWebhooks: data.deployWebhooks ?? [],
          mediaWebhooks: data.mediaWebhooks ?? [],
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
    { value: "off", label: t("settings.tools.scheduleOff") },
    { value: "daily", label: t("settings.tools.scheduleDaily") },
    { value: "weekly", label: t("settings.tools.scheduleWeekly") },
  ];

  // "Fires {events}." — the event names stay as code, the sentence around them is translated.
  function fires(key: string, events: string[]) {
    const [before, after] = t(key).split("{events}");
    return (
      <>
        {before}
        {events.map((e, i) => (
          <Fragment key={e}>{i > 0 && ", "}<code style={{ fontSize: "0.7rem" }}>{e}</code></Fragment>
        ))}
        {after}
      </>
    );
  }

  const labelStyle = { display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem" } as const;
  const descStyle = { fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.25rem" } as const;
  const webhookLabel = { display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem", marginTop: "0.75rem" } as const;

  return (
    <div data-testid="tools-settings-panel">
      {/* ── Link Checker ───────────────────────────────────── */}
      <SectionHeading>{t("settings.tools.linkCheckerHeading")}</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
          {t("settings.tools.linkCheckerHint")}
        </p>

        <div>
          <label style={labelStyle}>{t("settings.tools.frequency")}</label>
          <CustomSelect
            value={config.linkCheckSchedule}
            onChange={(v) => updateConfig((c) => ({ ...c, linkCheckSchedule: v as AutomationConfig["linkCheckSchedule"] }))}
            options={scheduleOptions}
          />
        </div>

        {config.linkCheckSchedule !== "off" && (
          <div>
            <label style={labelStyle}>{t("settings.tools.time")}</label>
            <CustomTimeInput
              value={config.linkCheckTime}
              onChange={(v) => updateConfig((c) => ({ ...c, linkCheckTime: v }))}
            />
          </div>
        )}

        <label style={webhookLabel}>{t("settings.tools.webhooks")}</label>
        <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: "-0.5rem 0 0" }}>
          {t("settings.tools.linkCheckWebhooksHint")}
        </p>
        <WebhookList
          webhooks={config.linkCheckWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, linkCheckWebhooks: w }))}
        />
      </SettingsCard>

      {/* ── Content Publishing ─────────────────────────────── */}
      <SectionHeading>{t("settings.tools.publishingHeading")}</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
          {t("settings.tools.publishingHint")}
        </p>
        <WebhookList
          webhooks={config.publishWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, publishWebhooks: w }))}
        />
      </SettingsCard>

      {/* ── Default Agent Webhook ──────────────────────────── */}
      <SectionHeading>{t("settings.tools.agentsHeading")}</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
          {t("settings.tools.agentsHint")}{" "}
          {fires("settings.tools.firesEvents", ["agent.started", "agent.completed", "agent.failed"])}
        </p>
        <WebhookList
          webhooks={config.agentDefaultWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, agentDefaultWebhooks: w }))}
        />
      </SettingsCard>

      {/* ── F35 Content Lifecycle ──────────────────────────── */}
      <SectionHeading>{t("settings.tools.contentLifecycleHeading")}</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
          {t("settings.tools.contentLifecycleHint")}{" "}
          {fires("settings.tools.firesEventsEtc", ["content.published", "content.updated", "content.trashed"])}{" "}
          {t("settings.tools.hmacHint")}
        </p>
        <WebhookList
          webhooks={config.contentWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, contentWebhooks: w }))}
        />
      </SettingsCard>

      {/* ── F35 Deploy Lifecycle ───────────────────────────── */}
      <SectionHeading>{t("settings.tools.deployLifecycleHeading")}</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
          {t("settings.tools.deployLifecycleHint")}{" "}
          {fires("settings.tools.firesEvents", ["deploy.started", "deploy.success", "deploy.failed"])}
        </p>
        <WebhookList
          webhooks={config.deployWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, deployWebhooks: w }))}
        />
      </SettingsCard>

      {/* ── F35 Media Lifecycle ────────────────────────────── */}
      <SectionHeading>{t("settings.tools.mediaLifecycleHeading")}</SectionHeading>
      <SettingsCard>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
          {t("settings.tools.mediaLifecycleHint")}{" "}
          {fires("settings.tools.firesEvents", ["media.uploaded", "media.deleted"])}
        </p>
        <WebhookList
          webhooks={config.mediaWebhooks}
          onChange={(w) => updateConfig((c) => ({ ...c, mediaWebhooks: w }))}
        />
      </SettingsCard>

      <SectionHeading>{t("settings.tools.imageAnalysisHeading")}</SectionHeading>
      <SettingsCard>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.8rem", fontWeight: 500 }}>
            {t("settings.tools.batchOverwrite")}
          </label>
          <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
            {t("settings.tools.batchOverwriteHint")}
          </p>
          <CustomSelect
            value={config.aiImageOverwrite}
            onChange={(v) => updateConfig((c) => ({ ...c, aiImageOverwrite: v as AutomationConfig["aiImageOverwrite"] }))}
            options={[
              { value: "ask", label: t("settings.tools.overwriteAsk") },
              { value: "skip", label: t("settings.tools.overwriteSkip") },
              { value: "overwrite", label: t("settings.tools.overwriteAlways") },
            ]}
          />
        </div>
      </SettingsCard>

      <div id="media-processing" />
      <SectionHeading>{t("settings.tools.mediaProcessingHeading")}</SectionHeading>
      <SettingsCard>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <input
              data-testid="tools-media-auto-optimize"
              type="checkbox"
              checked={config.mediaAutoOptimize}
              onChange={(e) => updateConfig((c) => ({ ...c, mediaAutoOptimize: e.target.checked }))}
              style={{ accentColor: "var(--primary)" }}
            />
            <div>
              <label style={{ fontSize: "0.8rem", fontWeight: 500 }}>{t("settings.tools.generateWebp")}</label>
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
                {t("settings.tools.generateWebpHint")}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 500 }}>{t("settings.tools.variantWidths")}</label>
            <input
              data-testid="tools-settings-media-variant-widths"
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
              {t("settings.tools.variantWidthsHint")}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              {t("settings.tools.webpQuality", { quality: config.mediaWebpQuality })}
            </label>
            <CustomRangeSlider
              min={10}
              max={100}
              step={5}
              value={config.mediaWebpQuality}
              onChange={(v) => updateConfig((c) => ({ ...c, mediaWebpQuality: v }))}
            />
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
              {t("settings.tools.webpQualityHint")}
            </p>
          </div>
        </div>
      </SettingsCard>

    </div>
  );
}
