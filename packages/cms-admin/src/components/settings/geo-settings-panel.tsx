"use client";

import { useState, useEffect } from "react";
import { SettingsCard, SettingsInput } from "./settings-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { CustomSelect } from "@/components/ui/custom-select";

const STRATEGIES = [
  { value: "maximum", label: "Maximum — allow all AI crawlers (best for visibility)" },
  { value: "balanced", label: "Balanced — allow search bots, block training bots" },
  { value: "restrictive", label: "Restrictive — block all AI crawlers" },
  { value: "custom", label: "Custom — define your own rules" },
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
    const apiKey = `geo${key.charAt(0).toUpperCase()}${key.slice(1)}` as string;
    fetch("/api/admin/site-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [apiKey]: value }),
    }).catch(() => {});
  }

  // Generate preview of robots.txt
  const previewLines: string[] = [];
  if (config.robotsStrategy === "maximum") {
    previewLines.push("User-agent: * → Allow: /");
    previewLines.push("All AI crawlers → Allow: /");
  } else if (config.robotsStrategy === "balanced") {
    previewLines.push("Search bots (ChatGPT-User, Claude-SearchBot, PerplexityBot) → Allow");
    previewLines.push("Training bots (GPTBot, ClaudeBot, CCBot) → Disallow");
  } else if (config.robotsStrategy === "restrictive") {
    previewLines.push("All AI crawlers → Disallow: /");
    previewLines.push("Traditional search engines → Allow: /");
  } else {
    previewLines.push("Custom rules (see below)");
  }

  if (loading) return <div data-testid="panel-geo" style={{ padding: "1rem", color: "var(--muted-foreground)", fontSize: "0.8rem" }}>Loading…</div>;

  return (
    <div data-testid="panel-geo" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
{/* robots.txt Strategy */}
      <div>
        <SectionHeading>robots.txt Strategy</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          Controls how AI crawlers access your site. Affects ChatGPT, Claude, Perplexity, Google AI.
        </p>
        <SettingsCard>
          <div style={{ marginBottom: "0.75rem" }}>
            <CustomSelect
              options={STRATEGIES}
              value={config.robotsStrategy}
              onChange={(v) => update("robotsStrategy", String(v))}
            />
          </div>
          <div style={{ padding: "0.5rem 0.75rem", borderRadius: "6px", background: "var(--background)", border: "1px solid var(--border)", fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>
            {previewLines.map((l, i) => <div key={i}>{l}</div>)}
          </div>

          {config.robotsStrategy === "custom" && (
            <div style={{ marginTop: "0.75rem" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)", marginBottom: "0.25rem" }}>Custom rules</p>
              <textarea
                value={config.robotsCustomRules}
                onChange={(e) => update("robotsCustomRules", e.target.value)}
                placeholder={"User-agent: GPTBot\nDisallow: /"}
                rows={6}
                style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.75rem", fontFamily: "monospace", resize: "vertical" }}
              />
              <p style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", marginTop: "0.2rem" }}>One rule per line</p>
            </div>
          )}

          <div style={{ marginTop: "0.75rem" }}>
            <SettingsInput
              label="Disallow paths"
              description="Comma-separated paths blocked for all bots"
              value={config.robotsDisallowPaths}
              onChange={(e) => update("robotsDisallowPaths", e.target.value)}
            />
          </div>
        </SettingsCard>
      </div>

      {/* Organization Schema */}
      <div>
        <SectionHeading>Organization</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          Used for site-wide JSON-LD structured data. Helps AI understand your brand entity.
        </p>
        <SettingsCard>
          <SettingsInput label="Organization name" value={config.organizationName} onChange={(e) => update("organizationName", e.target.value)} />
          <SettingsInput label="Website URL" value={config.organizationUrl} onChange={(e) => update("organizationUrl", e.target.value)} placeholder="https://..." />
          <SettingsInput label="Logo URL" value={config.organizationLogo} onChange={(e) => update("organizationLogo", e.target.value)} placeholder="/uploads/logo.svg" />
        </SettingsCard>
      </div>

      {/* AI Visibility API Keys */}
      <div>
        <SectionHeading>AI Visibility APIs (optional)</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          API keys for the Visibility Monitor and Index Checker. Not required for basic GEO features.
        </p>
        <SettingsCard>
          <SettingsInput label="Perplexity API key" description="For AI visibility probes ($5/1000 queries)" value={config.perplexityApiKey} onChange={(e) => update("perplexityApiKey", e.target.value)} type="password" />
          <SettingsInput label="Google Custom Search API key" description="For index checking (free: 100 queries/day)" value={config.googleSearchApiKey} onChange={(e) => update("googleSearchApiKey", e.target.value)} type="password" />
          <SettingsInput label="Google Search Engine ID (cx)" description="Custom search engine ID" value={config.googleSearchCx} onChange={(e) => update("googleSearchCx", e.target.value)} />
        </SettingsCard>
      </div>
    </div>
  );
}
