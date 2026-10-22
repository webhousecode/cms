"use client";

import { CustomSelect } from "@/components/ui/custom-select";
import { SectionHeading } from "@/components/ui/section-heading";
import { FLY_REGIONS, FLY_VM_SIZES } from "@/lib/deploy/fly-machines";
import { Download } from "lucide-react";
import type { WizardState } from "./deploy-wizard";
import { useT } from "@/lib/i18n-context";

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
  const t = useT();
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
      <SectionHeading>{t("misc.deployWizard.configure.title")}</SectionHeading>
      <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        {t("misc.deployWizard.configure.intro")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "28rem" }}>
        {/* App name */}
        <div>
          <label style={labelStyle}>{t("misc.deployWizard.configure.appName")}</label>
          <input
            data-testid="deploy-app-name-input"
            type="text"
            value={appName}
            onChange={(e) => onUpdate({ appName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            placeholder={t("misc.deployWizard.configure.appNamePlaceholder")}
            style={{
              ...inputStyle,
              borderColor: appName && !appNameValid ? "var(--destructive)" : undefined,
            }}
          />
          <div style={{ fontSize: "0.68rem", color: appName && !appNameValid ? "var(--destructive)" : "var(--muted-foreground)", marginTop: "0.25rem" }}>
            {appName && !appNameValid
              ? t("misc.deployWizard.configure.appNameInvalid")
              : t("misc.deployWizard.configure.appNameHint", { host: `${appName || "___"}.fly.dev` })}
          </div>
        </div>

        {/* Admin email */}
        <div>
          <label style={labelStyle}>{t("misc.deployWizard.configure.adminEmail")}</label>
          <input
            data-testid="deploy-admin-email-input"
            type="email"
            value={adminEmail}
            onChange={(e) => onUpdate({ adminEmail: e.target.value })}
            placeholder={t("misc.deployWizard.configure.adminEmailPlaceholder")}
            style={inputStyle}
          />
          <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
            {t("misc.deployWizard.configure.adminEmailHint")}
          </div>
        </div>

        {/* Region */}
        <div>
          <label style={labelStyle}>{t("misc.deployWizard.configure.region")}</label>
          <CustomSelect
            options={FLY_REGIONS.map((r) => ({ value: r.value, label: r.label }))}
            value={region}
            onChange={(v) => onUpdate({ region: v })}
            style={{ fontSize: "0.8rem" }}
          />
        </div>

        {/* VM size */}
        <div>
          <label style={labelStyle}>{t("misc.deployWizard.configure.vmSize")}</label>
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
          {t("misc.deployWizard.configure.selfHost")}
        </p>
        <button
          data-testid="deploy-download-docker-button"
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
          {t("misc.deployWizard.configure.downloadDocker")}
        </button>
      </div>
    </div>
  );
}
