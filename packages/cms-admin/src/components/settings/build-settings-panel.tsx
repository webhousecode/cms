/**
 * Site Settings → Build tab.
 *
 * Two sections:
 *   - Build output: file tree + preview of <projectDir>/deploy/ on disk
 *   - SSR builds: history of F144 ephemeral builder runs (when present)
 *
 * Lives in its own tab so the preview iframe can use the full workspace
 * width — was previously squeezed inside the Deploy tab's max-w-lg
 * SettingsCard.
 */
"use client";

import { useEffect, useState } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { SettingsCard } from "./settings-card";
import { DeployOutputBrowser } from "@/components/deploy-output-browser";
import { BuildHistory } from "@/components/build-history";
import { useT } from "@/lib/i18n-context";

export function BuildSettingsPanel() {
  const t = useT();
  const [siteId, setSiteId] = useState<string | null>(null);
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)cms-active-site=([^;]+)/);
    setSiteId(m && m[1] ? decodeURIComponent(m[1]) : null);
  }, []);

  if (!siteId) {
    return (
      <div style={{ color: "var(--muted-foreground)", fontSize: "0.85rem" }}>
        {t("settings.buildSettings.noActiveSite")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <SectionHeading first>{t("settings.buildSettings.outputHeading")}</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {(() => {
            const [before, after] = t("settings.buildSettings.outputHint").split("{path}");
            return <>{before}<code>deploy/</code>{after}</>;
          })()}
        </p>
        <SettingsCard>
          <DeployOutputBrowser siteId={siteId} />
        </SettingsCard>
      </div>

      <div>
        <SectionHeading>{t("settings.buildSettings.ssrHeading")}</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {t("settings.buildSettings.ssrHint")}
        </p>
        <SettingsCard>
          <BuildHistory siteId={siteId} />
        </SettingsCard>
      </div>
    </div>
  );
}
