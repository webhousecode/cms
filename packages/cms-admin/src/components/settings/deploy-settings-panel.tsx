"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { SettingsCard } from "./settings-card";
import { CustomSelect } from "@/components/ui/custom-select";
import { Rocket, ExternalLink, Check, X, Loader2, RefreshCw, Copy } from "lucide-react";
import { DeployModal } from "@/components/deploy-modal";
import { HelpCard } from "@/components/ui/help-card";

type DeployProvider = "off" | "vercel" | "netlify" | "flyio" | "cloudflare" | "github-pages" | "custom";

interface DeployEntry {
  id: string;
  provider: string;
  status: "triggered" | "success" | "error";
  timestamp: string;
  url?: string;
  error?: string;
  duration?: number;
}

interface DeployConfig {
  deployProvider: DeployProvider;
  deployHookUrl: string;
  deployApiToken: string;
  deployAppName: string;
  deployFlyOrg: string;
  deployProductionUrl: string;
  deployCustomDomain: string;
  deployOnSave: boolean;
}

const CONFIG_DEFAULTS: DeployConfig = {
  deployProvider: "off",
  deployHookUrl: "",
  deployApiToken: "",
  deployAppName: "",
  deployFlyOrg: "",
  deployProductionUrl: "",
  deployCustomDomain: "",
  deployOnSave: false,
};

export function DeploySettingsPanel() {
  const [config, setConfig] = useState<DeployConfig>(CONFIG_DEFAULTS);
  const [canAutoDeploy, setCanAutoDeploy] = useState(false);
  const [hasGitHubToken, setHasGitHubToken] = useState(false);
  const [deploys, setDeploys] = useState<DeployEntry[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDeployModal, setShowDeployModal] = useState(false);

  // Auto-open modal when navigated with ?deploy=1 (from header button)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("deploy") === "1") {
      setShowDeployModal(true);
      // Clean up URL param
      const url = new URL(window.location.href);
      url.searchParams.delete("deploy");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [canRes, logRes, cfgRes] = await Promise.all([
      fetch("/api/admin/deploy/can-deploy").then((r) => r.ok ? r.json() : { canDeploy: false }),
      fetch("/api/admin/deploy").then((r) => r.ok ? r.json() : { deploys: [] }),
      fetch("/api/admin/site-config").then((r) => r.ok ? r.json() : {}) as Promise<Record<string, unknown>>,
    ]);
    setCanAutoDeploy(canRes.canDeploy);
    setHasGitHubToken(canRes.hasGitHubToken ?? false);
    setConfig({
      deployProvider: (cfgRes.deployProvider as DeployProvider) ?? "off",
      deployHookUrl: (cfgRes.deployHookUrl as string) ?? "",
      deployApiToken: (cfgRes.deployApiToken as string) ?? "",
      deployAppName: (cfgRes.deployAppName as string) ?? "",
      deployFlyOrg: (cfgRes.deployFlyOrg as string) ?? "",
      deployProductionUrl: (cfgRes.deployProductionUrl as string) ?? "",
      deployCustomDomain: (cfgRes.deployCustomDomain as string) ?? "",
      deployOnSave: (cfgRes.deployOnSave as boolean) ?? false,
    });
    setDeploys(logRes.deploys ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Save config via ActionBar save event
  const handleSave = useCallback(async () => {
    await fetch("/api/admin/site-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    window.dispatchEvent(new CustomEvent("cms:settings-saved"));
  }, [config]);

  useEffect(() => {
    function onSave() { handleSave(); }
    window.addEventListener("cms:settings-save", onSave);
    return () => window.removeEventListener("cms:settings-save", onSave);
  }, [handleSave]);

  function updateConfig(fn: (c: DeployConfig) => DeployConfig) {
    setConfig(fn);
    window.dispatchEvent(new CustomEvent("cms:settings-dirty"));
  }

  const handleDeploy = useCallback(async () => {
    setDeploying(true);
    try {
      const res = await fetch("/api/admin/deploy", { method: "POST" });
      const data = await res.json() as DeployEntry;
      setDeploys((prev) => [data, ...prev]);
      if (data.url && !config.deployProductionUrl) {
        setConfig((prev) => ({ ...prev, deployProductionUrl: data.url! }));
      }
    } catch { /* handled by deploy log */ }
    setDeploying(false);
  }, [config.deployProductionUrl]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "2rem 0", color: "var(--muted-foreground)" }}>
        <Loader2 className="animate-spin" style={{ width: "1rem", height: "1rem" }} />
        <span style={{ fontSize: "0.8rem" }}>Loading deploy status...</span>
      </div>
    );
  }

  const deployProviders = [
    { value: "off", label: "Off" },
    { value: "vercel", label: "Vercel" },
    { value: "netlify", label: "Netlify" },
    { value: "flyio", label: "Fly.io" },
    { value: "cloudflare", label: "Cloudflare Pages" },
    { value: "github-pages", label: "GitHub Pages" },
    { value: "custom", label: "Custom webhook" },
  ];

  const effectiveProvider = config.deployProvider !== "off"
    ? config.deployProvider
    : canAutoDeploy ? "github-pages" : "off";

  const isAutoConfigured = config.deployProvider === "off" && canAutoDeploy;
  const needsHookUrl = ["vercel", "netlify", "cloudflare", "custom"].includes(config.deployProvider);
  const needsToken = ["flyio"].includes(config.deployProvider) || (config.deployProvider === "github-pages" && !canAutoDeploy);
  const needsAppName = ["flyio"].includes(config.deployProvider) || (config.deployProvider === "github-pages" && !canAutoDeploy);

  const providerLabel: Record<string, string> = {
    "github-pages": "GitHub Pages",
    vercel: "Vercel",
    netlify: "Netlify",
    flyio: "Fly.io",
    cloudflare: "Cloudflare Pages",
    custom: "Custom webhook",
  };

  const inputStyle = {
    padding: "0.45rem 0.75rem", borderRadius: "7px",
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace" as const,
    width: "100%", boxSizing: "border-box" as const,
  };

  return (
    <div data-testid="panel-deploy">
      {/* ── Provider config ─────────────────────────────── */}
      <SectionHeading first>Provider</SectionHeading>
      <SettingsCard>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.35rem" }}>Deploy provider</label>
          <CustomSelect
            value={config.deployProvider}
            onChange={(v) => updateConfig((c) => ({ ...c, deployProvider: v as DeployProvider }))}
            options={deployProviders}
          />
          {isAutoConfigured && (
            <p style={{
              fontSize: "0.65rem", margin: "0.35rem 0 0", padding: "0.3rem 0.5rem",
              borderRadius: "4px", lineHeight: 1.4,
              background: "color-mix(in srgb, var(--primary) 8%, transparent)",
              color: "var(--muted-foreground)",
            }}>
              Auto-detected — this site has a build pipeline and will deploy to GitHub Pages automatically. No manual configuration needed.
            </p>
          )}
          {config.deployProvider !== "off" && (
            <p style={{
              fontSize: "0.65rem", margin: "0.35rem 0 0", padding: "0.3rem 0.5rem",
              borderRadius: "4px", lineHeight: 1.4,
              background: "color-mix(in srgb, var(--primary) 8%, transparent)",
              color: "var(--muted-foreground)",
            }}>
              {config.deployProvider === "vercel" && "Recommended for Next.js and static sites. Supports SSR, API routes, and edge functions."}
              {config.deployProvider === "netlify" && "Supports Next.js via adapter, static sites, and serverless functions."}
              {config.deployProvider === "flyio" && "Docker-based. Best for SSR apps (Next.js, Remix) and custom servers. Deploys to arn (Stockholm)."}
              {config.deployProvider === "cloudflare" && "Static sites and Workers. Limited SSR support — not recommended for full Next.js apps."}
              {config.deployProvider === "github-pages" && canAutoDeploy && "Ready to deploy — using your existing GitHub connection. No additional configuration needed."}
              {config.deployProvider === "github-pages" && !canAutoDeploy && "Static files only. Requires a GitHub token and repository."}
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
            <input type="url" value={config.deployHookUrl} onChange={(e) => updateConfig((c) => ({ ...c, deployHookUrl: e.target.value }))}
              placeholder="https://api.vercel.com/v1/integrations/deploy/..." style={inputStyle} />
          </div>
        )}

        {needsToken && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>API Token</label>
              {config.deployProvider === "flyio" && (
                <a href="https://fly.io/dashboard/personal/tokens" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Get key <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              )}
              {config.deployProvider === "github-pages" && (
                <a href="https://github.com/settings/tokens/new?scopes=repo&description=webhouse-deploy" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Get key <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              )}
            </div>
            <input type="password" value={config.deployApiToken} onChange={(e) => updateConfig((c) => ({ ...c, deployApiToken: e.target.value }))}
              placeholder="Token..." style={{ ...inputStyle, fontFamily: "inherit" }} />
          </div>
        )}

        {needsAppName && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>
              {config.deployProvider === "flyio" ? "App name" : "Repository (owner/repo)"}
            </label>
            <input type="text" value={config.deployAppName} onChange={(e) => updateConfig((c) => ({ ...c, deployAppName: e.target.value }))}
              placeholder={config.deployProvider === "flyio" ? "my-app" : "owner/repo"} style={inputStyle} />
          </div>
        )}

        {config.deployProvider === "flyio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Organization</label>
            <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
              Fly.io org slug — auto-detected from token if left empty
            </p>
            <input type="text" value={config.deployFlyOrg} onChange={(e) => updateConfig((c) => ({ ...c, deployFlyOrg: e.target.value }))}
              placeholder="Auto-detect from token" style={inputStyle} />
          </div>
        )}

        {config.deployProvider === "flyio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Or: Deploy hook URL (alternative)</label>
            <input type="url" value={config.deployHookUrl} onChange={(e) => updateConfig((c) => ({ ...c, deployHookUrl: e.target.value }))}
              placeholder="https://..." style={inputStyle} />
          </div>
        )}
      </SettingsCard>

      {/* ── Connect GitHub (when needed and no token) ───── */}
      {effectiveProvider === "github-pages" && !hasGitHubToken && !needsToken && (
        <>
          <SectionHeading>GitHub Connection</SectionHeading>
          <SettingsCard>
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: 0 }}>
              Connect your GitHub account to deploy this site to GitHub Pages. A repository will be created automatically.
            </p>
            <a
              href="/api/auth/github"
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                padding: "0.45rem 1rem", borderRadius: "7px", border: "none",
                background: "#24292f", color: "#fff",
                fontSize: "0.8rem", fontWeight: 600, textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
              Connect GitHub
            </a>
          </SettingsCard>
        </>
      )}

      {/* ── Deploy action ────────────────────────────────── */}
      {effectiveProvider !== "off" && (
        <>
          <SectionHeading>Deploy</SectionHeading>
          <SettingsCard>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    {providerLabel[effectiveProvider] ?? effectiveProvider}
                  </span>
                  {config.deployOnSave && (
                    <span style={{
                      fontSize: "0.6rem", padding: "0.1rem 0.4rem", borderRadius: "9999px",
                      background: "var(--primary)", color: "#fff", fontWeight: 600,
                    }}>AUTO</span>
                  )}
                </div>
                {config.deployAppName && (
                  <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
                    {config.deployAppName}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowDeployModal(true)}
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

            {config.deployProductionUrl && (
              <a href={config.deployProductionUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", color: "var(--primary)", textDecoration: "none" }}>
                <ExternalLink style={{ width: "0.7rem", height: "0.7rem" }} />
                {config.deployProductionUrl}
              </a>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={config.deployOnSave}
                onChange={(e) => updateConfig((c) => ({ ...c, deployOnSave: e.target.checked }))}
                style={{ accentColor: "var(--primary)" }}
              />
              <span style={{ fontSize: "0.8rem" }}>Auto-deploy when content is saved</span>
            </label>
          </SettingsCard>
        </>
      )}

      <HelpCard articleId="settings-deploy-icd" variant="compact" />

      {/* ── Custom domain ────────────────────────────────── */}
      {(effectiveProvider === "github-pages" || effectiveProvider === "flyio") && (
        <>
          <SectionHeading>Custom Domain</SectionHeading>
          <SettingsCard>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
              {effectiveProvider === "github-pages"
                ? <>Use your own domain instead of <code style={{ fontSize: "0.7rem" }}>username.github.io/repo/</code>. Ask your DNS provider to create a <strong>CNAME</strong> record:</>
                : <>Use your own domain instead of <code style={{ fontSize: "0.7rem" }}>{config.deployAppName || "app"}.fly.dev</code>. Ask your DNS provider to create a <strong>CNAME</strong> record:</>
              }
            </p>
            <div style={{
              fontSize: "0.72rem", fontFamily: "monospace", padding: "0.4rem 0.6rem",
              borderRadius: "5px", background: "var(--background)", border: "1px solid var(--border)",
              color: "var(--foreground)", lineHeight: 1.6,
            }}>
              <span style={{ color: "var(--muted-foreground)" }}>Type:</span> CNAME<br />
              <span style={{ color: "var(--muted-foreground)" }}>Name:</span> your-subdomain<br />
              <span style={{ color: "var(--muted-foreground)" }}>Target:</span> {effectiveProvider === "github-pages"
                ? "your-username.github.io."
                : `${config.deployAppName || "app"}.fly.dev.`}
            </div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input
                type="text"
                value={config.deployCustomDomain}
                onChange={(e) => updateConfig((c) => ({ ...c, deployCustomDomain: e.target.value }))}
                placeholder={`${(config.deployAppName.split("/")[1] ?? "my-site").replace(/-site$/, "")}.webhouse.app`}
                style={{ ...inputStyle, flex: 1 }}
              />
              {config.deployCustomDomain && (
                <CopyButton text={config.deployCustomDomain} />
              )}
            </div>
            {config.deployCustomDomain && (
              <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
                Deploys will serve on <strong>{config.deployCustomDomain}</strong> with root paths.
              </p>
            )}
          </SettingsCard>
        </>
      )}

      {/* ── Deploy history (only when a provider is configured) ── */}
      {effectiveProvider !== "off" && <>
      <SectionHeading>Deploy History</SectionHeading>
      <SettingsCard>
        {deploys.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: 0 }}>
            No deploys yet. Click &quot;Deploy now&quot; to publish your site.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
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
            {deploys.slice(0, 10).map((d) => (
              <div key={d.id} style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto auto",
                gap: "0.75rem", padding: "0.5rem 0", fontSize: "0.75rem",
                borderBottom: "1px solid var(--border)", alignItems: "center",
              }}>
                <span style={{ display: "flex", alignItems: "center" }}>
                  {d.status === "success" && <Check style={{ width: "0.8rem", height: "0.8rem", color: "rgb(74 222 128)" }} />}
                  {d.status === "error" && <span title={d.error} style={{ cursor: "help" }}><X style={{ width: "0.8rem", height: "0.8rem", color: "var(--destructive)" }} /></span>}
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
                    <span title={d.error} style={{ fontSize: "0.65rem", color: "var(--destructive)", cursor: "help" }}>{d.error.slice(0, 40)}</span>
                  ) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
        {deploys.length > 0 && (
          <button type="button" onClick={loadData}
            style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0", border: "none", background: "none", color: "var(--muted-foreground)", fontSize: "0.7rem", cursor: "pointer" }}>
            <RefreshCw style={{ width: "0.65rem", height: "0.65rem" }} /> Refresh
          </button>
        )}
      </SettingsCard>
      </>}

      {/* Deploy modal with progress */}
      <DeployModal
        open={showDeployModal}
        onClose={() => { setShowDeployModal(false); loadData(); }}
        configured={effectiveProvider !== "off"}
        providerLabel={providerLabel[effectiveProvider] ?? effectiveProvider}
        appName={config.deployAppName || undefined}
        productionUrl={config.deployProductionUrl || undefined}
        deployOnSave={config.deployOnSave}
      />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy to clipboard"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        width: "32px", height: "32px", borderRadius: "6px",
        border: "1px solid var(--border)", background: "transparent",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        color: copied ? "rgb(74 222 128)" : "var(--muted-foreground)", flexShrink: 0,
      }}
    >
      {copied ? <Check style={{ width: "0.85rem", height: "0.85rem" }} /> : <Copy style={{ width: "0.85rem", height: "0.85rem" }} />}
    </button>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("da-DK", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}
