"use client";

import { useState, useEffect } from "react";
import { SettingsCard, SettingsInput } from "./settings-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { CustomSelect } from "@/components/ui/custom-select";
import { useT } from "@/lib/i18n-context";

const STRATEGIES = [
  { value: "maximum", label: "settings.geo.strategyMaximum" },
  { value: "balanced", label: "settings.geo.strategyBalanced" },
  { value: "restrictive", label: "settings.geo.strategyRestrictive" },
  { value: "custom", label: "settings.geo.strategyCustom" },
];

interface GeoConfig {
  robotsStrategy: string;
  robotsCustomRules: string;
  robotsDisallowPaths: string;
  perplexityApiKey: string;
  googleSearchApiKey: string;
  googleSearchCx: string;
  organizationName: string;
  organizationUrl: string;
  organizationLogo: string;
}

export function GeoSettingsPanel() {
  const t = useT();
  const [config, setConfig] = useState<GeoConfig>({
    robotsStrategy: "maximum",
    robotsCustomRules: "",
    robotsDisallowPaths: "/admin/, /api/",
    perplexityApiKey: "",
    googleSearchApiKey: "",
    googleSearchCx: "",
    organizationName: "",
    organizationUrl: "",
    organizationLogo: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        setConfig({
          robotsStrategy: String(data.geoRobotsStrategy ?? "maximum"),
          robotsCustomRules: String(data.geoRobotsCustomRules ?? ""),
          robotsDisallowPaths: String(data.geoRobotsDisallowPaths ?? "/admin/, /api/"),
          perplexityApiKey: String(data.geoPerplexityApiKey ?? ""),
          googleSearchApiKey: String(data.geoGoogleSearchApiKey ?? ""),
          googleSearchCx: String(data.geoGoogleSearchCx ?? ""),
          organizationName: String(data.geoOrganizationName ?? ""),
          organizationUrl: String(data.geoOrganizationUrl ?? ""),
          organizationLogo: String(data.geoOrganizationLogo ?? ""),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update(key: keyof GeoConfig, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    window.dispatchEvent(new CustomEvent("cms:settings-dirty"));
    // Persist via settings save button (same pattern as other panels)
    const apiKey = `geo${key.charAt(0).toUpperCase()}${key.slice(1)}` as string; // i18n-ignore: config key name
    fetch("/api/admin/site-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [apiKey]: value }),
    }).catch(() => {});
  }

  // Generate preview of robots.txt
  const previewLines: string[] = [];
  if (config.robotsStrategy === "maximum") {
    previewLines.push("User-agent: * → Allow: /"); // i18n-ignore: robots.txt syntax preview
    previewLines.push(t("settings.geo.previewAllAiAllow"));
  } else if (config.robotsStrategy === "balanced") {
    previewLines.push(t("settings.geo.previewSearchBotsAllow"));
    previewLines.push(t("settings.geo.previewTrainingBotsDisallow"));
  } else if (config.robotsStrategy === "restrictive") {
    previewLines.push(t("settings.geo.previewAllAiDisallow"));
    previewLines.push(t("settings.geo.previewTraditionalAllow"));
  } else {
    previewLines.push(t("settings.geo.previewCustom"));
  }

  if (loading) return <div data-testid="panel-geo" style={{ padding: "1rem", color: "var(--muted-foreground)", fontSize: "0.8rem" }}>{t("settings.common.loading")}</div>;

  return (
    <div data-testid="panel-geo" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
{/* robots.txt Strategy */}
      <div>
        <SectionHeading>{t("settings.geo.robotsHeading")}</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {t("settings.geo.robotsHint")}
        </p>
        <SettingsCard>
          <div style={{ marginBottom: "0.75rem" }}>
            <CustomSelect
              options={STRATEGIES.map((o) => ({ value: o.value, label: t(o.label) }))}
              value={config.robotsStrategy}
              onChange={(v) => update("robotsStrategy", String(v))}
            />
          </div>
          <div style={{ padding: "0.5rem 0.75rem", borderRadius: "6px", background: "var(--background)", border: "1px solid var(--border)", fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>
            {previewLines.map((l, i) => <div key={i}>{l}</div>)}
          </div>

          {config.robotsStrategy === "custom" && (
            <div style={{ marginTop: "0.75rem" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)", marginBottom: "0.25rem" }}>{t("settings.geo.customRules")}</p>
              <textarea
                data-testid="geo-robots-custom-rules"
                value={config.robotsCustomRules}
                onChange={(e) => update("robotsCustomRules", e.target.value)}
                placeholder={"User-agent: GPTBot\nDisallow: /"} // i18n-ignore: robots.txt syntax example
                rows={6}
                style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.75rem", fontFamily: "monospace", resize: "vertical" }}
              />
              <p style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", marginTop: "0.2rem" }}>{t("settings.geo.oneRulePerLine")}</p>
            </div>
          )}

          <div style={{ marginTop: "0.75rem" }}>
            <SettingsInput
              label={t("settings.geo.disallowPaths")}
              description={t("settings.geo.disallowPathsHint")}
              value={config.robotsDisallowPaths}
              onChange={(e) => update("robotsDisallowPaths", e.target.value)}
            />
          </div>
        </SettingsCard>
      </div>

      {/* Organization Schema */}
      <div>
        <SectionHeading>{t("settings.geo.orgHeading")}</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {t("settings.geo.orgHint")}
        </p>
        <SettingsCard>
          <SettingsInput label={t("settings.geo.orgName")} value={config.organizationName} onChange={(e) => update("organizationName", e.target.value)} />
          {/* i18n-ignore: example URL */}
          <SettingsInput label={t("settings.geo.websiteUrl")} value={config.organizationUrl} onChange={(e) => update("organizationUrl", e.target.value)} placeholder="https://..." />
          {/* i18n-ignore: example path */}
          <SettingsInput label={t("settings.geo.logoUrl")} value={config.organizationLogo} onChange={(e) => update("organizationLogo", e.target.value)} placeholder="/uploads/logo.svg" />
        </SettingsCard>
      </div>

      {/* AI Visibility API Keys */}
      <div>
        <SectionHeading>{t("settings.geo.apisHeading")}</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {t("settings.geo.apisHint")}
        </p>
        <SettingsCard>
          <SettingsInput label={t("settings.geo.perplexityKey")} description={t("settings.geo.perplexityKeyHint")} value={config.perplexityApiKey} onChange={(e) => update("perplexityApiKey", e.target.value)} type="password" />
          <SettingsInput label={t("settings.geo.googleKey")} description={t("settings.geo.googleKeyHint")} value={config.googleSearchApiKey} onChange={(e) => update("googleSearchApiKey", e.target.value)} type="password" />
          <SettingsInput label={t("settings.geo.googleCx")} description={t("settings.geo.googleCxHint")} value={config.googleSearchCx} onChange={(e) => update("googleSearchCx", e.target.value)} />
        </SettingsCard>
      </div>
    </div>
  );
}
