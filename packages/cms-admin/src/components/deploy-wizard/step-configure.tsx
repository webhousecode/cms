"use client";

import { CustomSelect } from "@/components/ui/custom-select";
import { SectionHeading } from "@/components/ui/section-heading";
import { FLY_REGIONS, FLY_VM_SIZES } from "@/lib/deploy/fly-machines";
import { Download } from "lucide-react";
import type { WizardState } from "./deploy-wizard";

interface Props {
  appName: string;
  region: string;
  vmSize: string;
  adminEmail: string;
  onUpdate: (partial: Partial<WizardState>) => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.6rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: "0.8rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "var(--muted-foreground)",
  display: "block",
  marginBottom: "0.3rem",
};

export function StepConfigure({ appName, region, vmSize, adminEmail, onUpdate }: Props) {
  const appNameValid = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(appName);

  function handleDownloadZip() {
    fetch("/api/admin/deploy/download-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "", appName }),
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `webhouse-docker-${appName}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div>
      <SectionHeading>Configure deployment</SectionHeading>
      <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        Set your app name, region, and VM size. All settings can be changed after deploy.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "28rem" }}>
        {/* App name */}
        <div>
          <label style={labelStyle}>App name</label>
          <input
            type="text"
            value={appName}
            onChange={(e) => onUpdate({ appName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            placeholder="my-awesome-site"
            style={{
              ...inputStyle,
              borderColor: appName && !appNameValid ? "var(--destructive)" : undefined,
            }}
          />
          <div style={{ fontSize: "0.68rem", color: appName && !appNameValid ? "var(--destructive)" : "var(--muted-foreground)", marginTop: "0.25rem" }}>
            {appName && !appNameValid
              ? "3-30 characters, lowercase letters, numbers, and hyphens only"
              : `Your site will be at ${appName || "___"}.fly.dev`}
          </div>
        </div>

        {/* Admin email */}
        <div>
          <label style={labelStyle}>Admin email</label>
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => onUpdate({ adminEmail: e.target.value })}
            placeholder="admin@webhouse.app"
            style={inputStyle}
          />
          <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
            Login email for the CMS admin. Password is auto-generated.
          </div>
        </div>

        {/* Region */}
        <div>
          <label style={labelStyle}>Region</label>
          <CustomSelect
            options={FLY_REGIONS.map((r) => ({ value: r.value, label: r.label }))}
            value={region}
            onChange={(v) => onUpdate({ region: v })}
            style={{ fontSize: "0.8rem" }}
          />
        </div>

        {/* VM size */}
        <div>
          <label style={labelStyle}>VM size</label>
          <CustomSelect
            options={FLY_VM_SIZES.map((s) => ({ value: s.value, label: s.label }))}
            value={vmSize}
            onChange={(v) => onUpdate({ vmSize: v })}
            style={{ fontSize: "0.8rem" }}
          />
        </div>
      </div>

      {/* Self-host alternative */}
      <div style={{
        marginTop: "2rem",
        paddingTop: "1.5rem",
        borderTop: "1px solid var(--border)",
      }}>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
          Prefer to self-host? Download a Docker package with everything you need.
        </p>
        <button
          onClick={handleDownloadZip}
          disabled={!appName}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.4rem 0.8rem",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--foreground)",
            fontSize: "0.78rem",
            cursor: appName ? "pointer" : "not-allowed",
            opacity: appName ? 1 : 0.5,
          }}
        >
          <Download style={{ width: 14, height: 14 }} />
          Download Docker package
        </button>
      </div>
    </div>
  );
}
