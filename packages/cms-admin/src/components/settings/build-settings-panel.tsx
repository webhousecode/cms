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

export function BuildSettingsPanel() {
  const [siteId, setSiteId] = useState<string | null>(null);
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)cms-active-site=([^;]+)/);
    setSiteId(m && m[1] ? decodeURIComponent(m[1]) : null);
  }, []);

  if (!siteId) {
    return (
      <div style={{ color: "var(--muted-foreground)", fontSize: "0.85rem" }}>
        No active site selected.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <SectionHeading first>Build output</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          The exact bytes the most recent build produced — read-only browser
          of <code>deploy/</code> on disk.
        </p>
        <SettingsCard>
          <DeployOutputBrowser siteId={siteId} />
        </SettingsCard>
      </div>

      <div>
        <SectionHeading>SSR builds</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          Recent ephemeral builder runs for sites that use the Fly.io
          ephemeral builder provider (Next.js / Bun-Hono / custom Dockerfile).
        </p>
        <SettingsCard>
          <BuildHistory siteId={siteId} />
        </SettingsCard>
      </div>
    </div>
  );
}
