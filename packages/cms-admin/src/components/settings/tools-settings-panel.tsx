"use client";

import { useEffect, useState } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { CustomSelect } from "@/components/ui/custom-select";

interface ToolsConfig {
  backupSchedule: "off" | "daily" | "weekly";
  backupTime: string;
  backupRetentionDays: number;
  linkCheckSchedule: "off" | "daily" | "weekly";
}

export function ToolsSettingsPanel() {
  const [config, setConfig] = useState<ToolsConfig>({
    backupSchedule: "off",
    backupTime: "03:00",
    backupRetentionDays: 30,
    linkCheckSchedule: "off",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setConfig({
          backupSchedule: data.backupSchedule ?? "off",
          backupTime: data.backupTime ?? "03:00",
          backupRetentionDays: data.backupRetentionDays ?? 30,
          linkCheckSchedule: data.linkCheckSchedule ?? "off",
        });
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
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
    }
  }

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

  return (
    <div>
      <SectionHeading>Backup Schedule</SectionHeading>
      <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
        Automatic backups of all content and site data. Scheduled backups appear in the Calendar.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem" }}>
            Frequency
          </label>
          <CustomSelect
            value={config.backupSchedule}
            onChange={(v) => setConfig((c) => ({ ...c, backupSchedule: v as ToolsConfig["backupSchedule"] }))}
            options={scheduleOptions}
          />
        </div>

        {config.backupSchedule !== "off" && (
          <>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem" }}>
                Time
              </label>
              <input
                type="time"
                value={config.backupTime}
                onChange={(e) => setConfig((c) => ({ ...c, backupTime: e.target.value }))}
                style={{
                  padding: "0.4rem 0.6rem", borderRadius: "0.375rem",
                  border: "1px solid var(--border)", background: "var(--background)",
                  color: "var(--foreground)", fontSize: "0.8125rem",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem" }}>
                Retention
              </label>
              <CustomSelect
                value={String(config.backupRetentionDays)}
                onChange={(v) => setConfig((c) => ({ ...c, backupRetentionDays: parseInt(v, 10) }))}
                options={retentionOptions}
              />
            </div>
          </>
        )}
      </div>

      <SectionHeading>Link Checker Schedule</SectionHeading>
      <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
        Automatic link checking across all content. Scheduled runs appear in the Calendar.
      </p>

      <div style={{ marginBottom: "2rem" }}>
        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem" }}>
          Frequency
        </label>
        <CustomSelect
          value={config.linkCheckSchedule}
          onChange={(v) => setConfig((c) => ({ ...c, linkCheckSchedule: v as ToolsConfig["linkCheckSchedule"] }))}
          options={scheduleOptions}
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: "0.5rem 1.25rem", borderRadius: "0.375rem",
          background: "var(--primary)", color: "var(--primary-foreground)",
          border: "none", cursor: saving ? "wait" : "pointer",
          fontSize: "0.8125rem", fontWeight: 500,
        }}
      >
        {saving ? "Saving..." : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
