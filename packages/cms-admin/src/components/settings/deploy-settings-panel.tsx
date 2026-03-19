"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { SettingsCard } from "./settings-card";
import { Rocket, ExternalLink, Check, X, Loader2, RefreshCw } from "lucide-react";

interface DeployEntry {
  id: string;
  provider: string;
  status: "triggered" | "success" | "error";
  timestamp: string;
  url?: string;
  error?: string;
  duration?: number;
}

interface DeployInfo {
  canDeploy: boolean;
  provider?: string;
  productionUrl?: string;
  deployOnSave?: boolean;
  deployAppName?: string;
  deployCustomDomain?: string;
}

export function DeploySettingsPanel() {
  const [info, setInfo] = useState<DeployInfo>({ canDeploy: false });
  const [deploys, setDeploys] = useState<DeployEntry[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [canRes, logRes, cfgRes] = await Promise.all([
      fetch("/api/admin/deploy/can-deploy").then((r) => r.ok ? r.json() : { canDeploy: false }),
      fetch("/api/admin/deploy").then((r) => r.ok ? r.json() : { deploys: [] }),
      fetch("/api/admin/site-config").then((r) => r.ok ? r.json() : {}) as Promise<Record<string, unknown>>,
    ]);
    setInfo({
      canDeploy: canRes.canDeploy,
      provider: canRes.provider,
      productionUrl: cfgRes.deployProductionUrl as string | undefined,
      deployOnSave: cfgRes.deployOnSave as boolean | undefined,
      deployAppName: cfgRes.deployAppName as string | undefined,
      deployCustomDomain: cfgRes.deployCustomDomain as string | undefined,
    });
    setDeploys(logRes.deploys ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDeploy = useCallback(async () => {
    setDeploying(true);
    try {
      const res = await fetch("/api/admin/deploy", { method: "POST" });
      const data = await res.json() as DeployEntry;
      setDeploys((prev) => [data, ...prev]);
      if (data.url && !info.productionUrl) {
        setInfo((prev) => ({ ...prev, productionUrl: data.url }));
      }
    } catch { /* handled by deploy log */ }
    setDeploying(false);
  }, [info.productionUrl]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "2rem 0", color: "var(--muted-foreground)" }}>
        <Loader2 className="animate-spin" style={{ width: "1rem", height: "1rem" }} />
        <span style={{ fontSize: "0.8rem" }}>Loading deploy status...</span>
      </div>
    );
  }

  if (!info.canDeploy) {
    return (
      <>
        <SectionHeading first>Deploy</SectionHeading>
        <SettingsCard>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.5rem", padding: "0.5rem 0" }}>
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: 0 }}>
              This site does not have a deploy pipeline configured. Static sites with a <code style={{ fontSize: "0.75rem" }}>build.ts</code> file
              can deploy to GitHub Pages automatically.
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
              Configure a deploy provider in <strong>Automation</strong> tab, or add a <code style={{ fontSize: "0.7rem" }}>build.ts</code> to your site.
            </p>
          </div>
        </SettingsCard>
      </>
    );
  }

  const providerLabel: Record<string, string> = {
    "github-pages": "GitHub Pages",
    vercel: "Vercel",
    netlify: "Netlify",
    flyio: "Fly.io",
    cloudflare: "Cloudflare Pages",
    custom: "Custom webhook",
  };

  return (
    <>
      <SectionHeading first>Deploy</SectionHeading>
      <SettingsCard>
        {/* Status bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                {providerLabel[info.provider ?? ""] ?? info.provider}
              </span>
              {info.deployOnSave && (
                <span style={{
                  fontSize: "0.6rem", padding: "0.1rem 0.4rem", borderRadius: "9999px",
                  background: "var(--primary)", color: "#fff", fontWeight: 600,
                }}>AUTO</span>
              )}
            </div>
            {info.deployAppName && (
              <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
                {info.deployAppName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleDeploy}
            disabled={deploying}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: "0.4rem 1rem", borderRadius: "7px",
              border: "none", background: "var(--primary)", color: "#fff",
              fontSize: "0.8rem", fontWeight: 600, cursor: deploying ? "wait" : "pointer",
              opacity: deploying ? 0.7 : 1,
            }}
          >
            {deploying
              ? <><Loader2 className="animate-spin" style={{ width: "0.85rem", height: "0.85rem" }} /> Deploying...</>
              : <><Rocket style={{ width: "0.85rem", height: "0.85rem" }} /> Deploy now</>}
          </button>
        </div>

        {/* Production URL */}
        {info.productionUrl && (
          <a
            href={info.productionUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: "0.35rem",
              fontSize: "0.75rem", color: "var(--primary)",
              textDecoration: "none",
            }}
          >
            <ExternalLink style={{ width: "0.7rem", height: "0.7rem" }} />
            {info.productionUrl}
          </a>
        )}
      </SettingsCard>

      {/* Custom domain */}
      {info.provider === "github-pages" && (
        <>
          <SectionHeading>Custom Domain</SectionHeading>
          <SettingsCard>
            <CustomDomainField
              value={info.deployCustomDomain ?? ""}
              onChange={(domain) => setInfo((prev) => ({ ...prev, deployCustomDomain: domain }))}
            />
          </SettingsCard>
        </>
      )}

      {/* Deploy history */}
      <SectionHeading>Deploy History</SectionHeading>
      <SettingsCard>
        {deploys.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: 0 }}>
            No deploys yet. Click &quot;Deploy now&quot; to publish your site.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: "auto 1fr auto auto",
              gap: "0.75rem", padding: "0.35rem 0",
              fontSize: "0.65rem", fontWeight: 600, color: "var(--muted-foreground)",
              textTransform: "uppercase", letterSpacing: "0.05em",
              borderBottom: "1px solid var(--border)",
            }}>
              <span>Status</span>
              <span>Time</span>
              <span>Duration</span>
              <span>URL</span>
            </div>
            {deploys.slice(0, 20).map((d) => (
              <div
                key={d.id}
                style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto auto",
                  gap: "0.75rem", padding: "0.5rem 0",
                  fontSize: "0.75rem",
                  borderBottom: "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                <span style={{ display: "flex", alignItems: "center" }}>
                  {d.status === "success" && <Check style={{ width: "0.8rem", height: "0.8rem", color: "rgb(74 222 128)" }} />}
                  {d.status === "error" && (
                    <span title={d.error} style={{ cursor: "help" }}>
                      <X style={{ width: "0.8rem", height: "0.8rem", color: "var(--destructive)" }} />
                    </span>
                  )}
                  {d.status === "triggered" && <Loader2 className="animate-spin" style={{ width: "0.8rem", height: "0.8rem" }} />}
                </span>
                <span style={{ color: "var(--muted-foreground)", fontFamily: "monospace", fontSize: "0.7rem" }}>
                  {formatTime(d.timestamp)}
                </span>
                <span style={{ color: "var(--muted-foreground)", fontFamily: "monospace", fontSize: "0.7rem" }}>
                  {d.duration ? `${(d.duration / 1000).toFixed(1)}s` : "—"}
                </span>
                <span>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontSize: "0.7rem" }}>
                      <ExternalLink style={{ width: "0.65rem", height: "0.65rem" }} />
                    </a>
                  ) : d.error ? (
                    <span title={d.error} style={{ fontSize: "0.65rem", color: "var(--destructive)", cursor: "help" }}>
                      {d.error.slice(0, 40)}
                    </span>
                  ) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
        {deploys.length > 0 && (
          <button
            type="button"
            onClick={loadData}
            style={{
              display: "flex", alignItems: "center", gap: "0.3rem",
              padding: "0.3rem 0", border: "none", background: "none",
              color: "var(--muted-foreground)", fontSize: "0.7rem", cursor: "pointer",
            }}
          >
            <RefreshCw style={{ width: "0.65rem", height: "0.65rem" }} /> Refresh
          </button>
        )}
      </SettingsCard>
    </>
  );
}

function CustomDomainField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [domain, setDomain] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = domain !== value;

  useEffect(() => { setDomain(value); }, [value]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/site-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployCustomDomain: domain }),
      });
      onChange(domain);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [domain, onChange]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
        Point a CNAME record to <code style={{ fontSize: "0.7rem" }}>cbroberg.github.io</code>, then enter the domain here.
        With a custom domain, links use root paths instead of <code style={{ fontSize: "0.7rem" }}>/repo-name/</code>.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="boutique.webhouse.app"
          style={{
            flex: 1, padding: "0.45rem 0.75rem", borderRadius: "7px",
            border: "1px solid var(--border)", background: "var(--background)",
            color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace",
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!changed || saving}
          style={{
            padding: "0.4rem 0.8rem", borderRadius: "7px",
            border: "none", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
            background: changed ? "var(--primary)" : "var(--muted)",
            color: changed ? "#fff" : "var(--muted-foreground)",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
      </div>
      {domain && (
        <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
          Next deploy will configure GitHub Pages to serve on <strong>{domain}</strong> and build with root paths.
        </p>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("da-DK", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
