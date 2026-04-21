"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { SettingsCard } from "./settings-card";
import { CustomSelect } from "@/components/ui/custom-select";
import { Rocket, ExternalLink, Check, X, Loader2, RefreshCw, Copy, Globe, Search } from "lucide-react";
import { DeployModal } from "@/components/deploy-modal";

type DeployProvider =
  | "off"
  | "vercel"
  | "netlify"
  | "flyio"
  | "flyio-live"
  | "cloudflare"
  | "cloudflare-pages"
  | "github-pages"
  | "custom";

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
  // F133 Fly Live
  deployFlyLiveRegion: string;
  deployFlyLiveVolumeName: string;
  deployFlyLiveSyncSecret: string;
  // F133 Cloudflare Pages (direct)
  deployCloudflareAccountId: string;
  deployCloudflareProjectName: string;
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
  deployFlyLiveRegion: "arn",
  deployFlyLiveVolumeName: "site_data",
  deployFlyLiveSyncSecret: "",
  deployCloudflareAccountId: "",
  deployCloudflareProjectName: "",
};

/** Re-check button with full feedback per CLAUDE.md hard rule:
 *  hover, active, loading-while-running, success-flash after. */
function RecheckButton({ busy, justRan, onClick }: { busy: boolean; justRan: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const success = justRan && !busy;
  return (
    <button
      onClick={onClick}
      disabled={busy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      title={busy ? "Checking DNS..." : success ? "Updated just now" : "Re-check DNS"}
      style={{
        padding: "0.35rem 0.7rem", borderRadius: "5px",
        background: success
          ? "color-mix(in srgb, #16a34a 18%, var(--background))"
          : active
          ? "color-mix(in srgb, var(--primary) 12%, var(--background))"
          : hover
          ? "var(--muted)"
          : "transparent",
        color: success ? "#16a34a" : "var(--muted-foreground)",
        border: `1px solid ${success ? "#16a34a" : "var(--border)"}`,
        fontSize: "0.65rem",
        cursor: busy ? "wait" : "pointer",
        display: "inline-flex", alignItems: "center", gap: "0.3rem",
        transform: active ? "translateY(1px)" : "none",
        transition: "background 100ms, color 100ms, border 100ms",
        whiteSpace: "nowrap",
      }}
    >
      {busy && <Loader2 className="animate-spin" style={{ width: "0.7rem", height: "0.7rem" }} />}
      {busy ? "Checking..." : success ? "✓ Updated" : "Re-check"}
    </button>
  );
}

interface FlyLiveStatus {
  provisioned: boolean;
  reachable: boolean;
  version: string | null;
  expectedVersion: string;
  isOutdated: boolean;
  url: string | null;
  region: string;
  volumeName: string;
  error: string | null;
}

export function DeploySettingsPanel() {
  const [config, setConfig] = useState<DeployConfig>(CONFIG_DEFAULTS);
  const [canAutoDeploy, setCanAutoDeploy] = useState(false);
  const [hasGitHubToken, setHasGitHubToken] = useState(false);
  const [deploys, setDeploys] = useState<DeployEntry[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [flyLiveStatus, setFlyLiveStatus] = useState<FlyLiveStatus | null>(null);
  const [rebuildConfirm, setRebuildConfirm] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);
  const [dnsStatus, setDnsStatus] = useState<{
    available: boolean;
    configured?: boolean;
    domain?: string;
    subdomain?: string;
    zone?: string;
    zoneManagedByApi?: boolean;
    expectedTarget?: string | null;
    currentTarget?: string | null;
    state?: "ok" | "missing" | "mismatch" | "no-zone" | "no-target";
    providerLabel?: string | null;
  } | null>(null);
  const [dnsBusy, setDnsBusy] = useState(false);
  const [dnsMsg, setDnsMsg] = useState<string | null>(null);
  const [dnsRecheckBusy, setDnsRecheckBusy] = useState(false);
  const [dnsRecheckedAt, setDnsRecheckedAt] = useState<number | null>(null);
  const [domainCheck, setDomainCheck] = useState<{
    state: "idle" | "checking" | "available" | "ours" | "taken" | "no-zone" | "invalid";
    conflicts?: Array<{ type: string; value: string }>;
    subdomain?: string;
    zone?: string;
    reason?: string;
  }>({ state: "idle" });

  // ── Registrar state ──────────────────────────────────────────────────
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [registrarQuery, setRegistrarQuery] = useState("");
  const [registrarSearching, setRegistrarSearching] = useState(false);
  const [registrarResults, setRegistrarResults] = useState<Array<{
    name: string; registrable: boolean; tier: string;
    pricing?: { currency: string; registration_cost: string; renewal_cost: string };
  }>>([]);
  const [registrarError, setRegistrarError] = useState<string | null>(null);
  const [registrarPending, setRegistrarPending] = useState<{
    domain_name: string; price: number; currency: string;
    confirm_token: string; expires_at: string;
  } | null>(null);
  const [registrarConfirming, setRegistrarConfirming] = useState(false);
  const [registrarDone, setRegistrarDone] = useState<string | null>(null);

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
      deployFlyLiveRegion: (cfgRes.deployFlyLiveRegion as string) ?? "arn",
      deployFlyLiveVolumeName: (cfgRes.deployFlyLiveVolumeName as string) ?? "site_data",
      deployFlyLiveSyncSecret: (cfgRes.deployFlyLiveSyncSecret as string) ?? "",
      deployCloudflareAccountId: (cfgRes.deployCloudflareAccountId as string) ?? "",
      deployCloudflareProjectName: (cfgRes.deployCloudflareProjectName as string) ?? "",
    });
    setDeploys(logRes.deploys ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // F133 — fetch Fly Live health status when provider is selected
  const loadFlyLiveStatus = useCallback(async () => {
    if (config.deployProvider !== "flyio-live") {
      setFlyLiveStatus(null);
      return;
    }
    try {
      const res = await fetch("/api/admin/deploy/fly-live/status");
      if (res.ok) setFlyLiveStatus(await res.json());
    } catch { /* best-effort */ }
  }, [config.deployProvider]);

  useEffect(() => { loadFlyLiveStatus(); }, [loadFlyLiveStatus]);

  // F133 — DNS auto-CNAME (Custom Domain field)
  const loadDnsStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deploy/dns/cname");
      if (res.ok) setDnsStatus(await res.json());
      else setDnsStatus({ available: false });
    } catch {
      setDnsStatus({ available: false });
    }
  }, []);

  useEffect(() => { loadDnsStatus(); }, [loadDnsStatus, config.deployCustomDomain, config.deployProvider, config.deployAppName]);

  // Debounced availability check on the Custom Domain input as the user types
  useEffect(() => {
    if (!dnsStatus?.available) return;
    const domain = config.deployCustomDomain.trim();
    if (!domain || !domain.includes(".")) {
      setDomainCheck({ state: "idle" });
      return;
    }
    setDomainCheck((s) => ({ ...s, state: "checking" }));
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/deploy/dns/availability?domain=${encodeURIComponent(domain)}`);
        if (!res.ok) { setDomainCheck({ state: "invalid" }); return; }
        setDomainCheck(await res.json());
      } catch {
        setDomainCheck({ state: "invalid" });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [config.deployCustomDomain, dnsStatus?.available, config.deployProvider, config.deployAppName]);

  const handleCreateCname = useCallback(async () => {
    setDnsBusy(true);
    setDnsMsg(null);
    try {
      const res = await fetch("/api/admin/deploy/dns/cname", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "CNAME creation failed");
      const verb = body.status === "created" ? "Created" : body.status === "updated" ? "Updated" : "Already up to date";
      setDnsMsg(`${verb}: ${body.subdomain}.${body.zone} → ${body.target}`);
      await loadDnsStatus();
    } catch (err) {
      setDnsMsg(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDnsBusy(false);
    }
  }, [loadDnsStatus]);

  const handleRegistrarSearch = useCallback(async () => {
    const q = registrarQuery.trim();
    if (!q) return;
    setRegistrarSearching(true);
    setRegistrarError(null);
    setRegistrarResults([]);
    setRegistrarPending(null);
    setRegistrarDone(null);
    try {
      const res = await fetch(`/api/admin/dns/registrar?action=search&q=${encodeURIComponent(q)}&limit=5`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setRegistrarResults(data.results ?? []);
    } catch (err) {
      setRegistrarError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setRegistrarSearching(false);
    }
  }, [registrarQuery]);

  const handleRegistrarInitiate = useCallback(async (domainName: string) => {
    setRegistrarError(null);
    try {
      const res = await fetch("/api/admin/dns/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initiate", domain_name: domainName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to initiate registration");
      setRegistrarPending({
        domain_name: data.domain_name ?? domainName,
        price: data.price,
        currency: data.currency,
        confirm_token: data.confirm_token,
        expires_at: data.expires_at,
      });
    } catch (err) {
      setRegistrarError(err instanceof Error ? err.message : "Failed to initiate registration");
    }
  }, []);

  const handleRegistrarConfirm = useCallback(async () => {
    if (!registrarPending) return;
    setRegistrarConfirming(true);
    setRegistrarError(null);
    try {
      const res = await fetch("/api/admin/dns/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          domain_name: registrarPending.domain_name,
          confirm_token: registrarPending.confirm_token,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setRegistrarDone(registrarPending.domain_name);
      setRegistrarPending(null);
      setRegistrarResults([]);
      // Suggest the newly registered domain as custom domain
      setRegistrarQuery("");
    } catch (err) {
      setRegistrarError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistrarConfirming(false);
    }
  }, [registrarPending]);

  const handleRebuildInfra = useCallback(async () => {
    setRebuilding(true);
    setRebuildMsg("Rebuilding Docker image on Fly... this takes ~60 seconds.");
    try {
      const res = await fetch("/api/admin/deploy/fly-live/rebuild", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Rebuild failed");
      setRebuildMsg("Infrastructure rebuilt. Content is preserved.");
      await loadFlyLiveStatus();
    } catch (err) {
      setRebuildMsg(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRebuilding(false);
      setRebuildConfirm(false);
    }
  }, [loadFlyLiveStatus]);

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
      // Always persist current panel state to disk BEFORE deploying so the
      // server-side triggerDeploy reads the values the user actually sees in
      // the UI (custom domain, provider config, etc.). Without this, typing
      // a custom domain and clicking Deploy without first hitting Save would
      // silently deploy the OLD config.
      await fetch("/api/admin/site-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      window.dispatchEvent(new CustomEvent("cms:settings-saved"));

      const res = await fetch("/api/admin/deploy", { method: "POST" });
      const data = await res.json() as DeployEntry;
      setDeploys((prev) => [data, ...prev]);
      if (data.url && !config.deployProductionUrl) {
        setConfig((prev) => ({ ...prev, deployProductionUrl: data.url! }));
      }
    } catch { /* handled by deploy log */ }
    setDeploying(false);
  }, [config]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "2rem 0", color: "var(--muted-foreground)" }}>
        <Loader2 className="animate-spin" style={{ width: "1rem", height: "1rem" }} />
        <span style={{ fontSize: "0.8rem" }}>Loading deploy status...</span>
      </div>
    );
  }

  // When provider="off" but auto-detect would route to GitHub Pages, relabel
  // the "off" option so the dropdown reflects what actually happens on Deploy.
  // The underlying value stays "off" — the user can still pick a different
  // provider explicitly without us touching their config in the background.
  const offLabel = canAutoDeploy && config.deployProvider === "off"
    ? "GitHub Pages (auto-detected)"
    : "Off";
  const deployProviders = [
    { value: "off", label: offLabel },
    { value: "vercel", label: "Vercel" },
    { value: "netlify", label: "Netlify" },
    { value: "cloudflare-pages", label: "Cloudflare Pages (direct)" },
    { value: "github-pages", label: "GitHub Pages" },
    { value: "flyio-live", label: "Fly.io Live (instant sync)" },
    { value: "flyio", label: "Fly.io (rebuild)" },
    { value: "cloudflare", label: "Cloudflare (webhook)" },
    { value: "custom", label: "Custom webhook" },
  ];

  const effectiveProvider = config.deployProvider !== "off"
    ? config.deployProvider
    : canAutoDeploy ? "github-pages" : "off";

  const isAutoConfigured = config.deployProvider === "off" && canAutoDeploy;
  const needsHookUrl = ["vercel", "netlify", "cloudflare", "custom"].includes(config.deployProvider);
  const needsToken = ["flyio", "flyio-live"].includes(config.deployProvider) || (config.deployProvider === "github-pages" && !canAutoDeploy);
  const needsAppName = ["flyio", "flyio-live"].includes(config.deployProvider) || (config.deployProvider === "github-pages" && !canAutoDeploy);

  const providerLabel: Record<string, string> = {
    "github-pages": "GitHub Pages",
    vercel: "Vercel",
    netlify: "Netlify",
    flyio: "Fly.io (rebuild)",
    "flyio-live": "Fly.io Live",
    cloudflare: "Cloudflare (webhook)",
    "cloudflare-pages": "Cloudflare Pages",
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
      {/* ── F133: drift banner — show when sync-endpoint lags admin bundle ── */}
      {flyLiveStatus?.provisioned && flyLiveStatus.isOutdated && (
        <div
          role="alert"
          style={{
            padding: "0.75rem 1rem",
            borderRadius: 8,
            border: "1px solid #d97706",
            background: "color-mix(in srgb, #d97706 10%, var(--card))",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#d97706" }}>Sync endpoint is out of date</div>
            <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
              Your Fly container runs sync-endpoint v{flyLiveStatus.version}, but cms-admin now bundles v{flyLiveStatus.expectedVersion}. Rebuild to get the latest fixes.
            </div>
          </div>
          <button
            onClick={() => {
              const infraSection = document.querySelector('[data-rebuild-infra-section]');
              infraSection?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            style={{
              padding: "0.4rem 0.8rem", borderRadius: 6,
              background: "#d97706", color: "#fff",
              border: "none", fontSize: "0.7rem", fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Rebuild infrastructure →
          </button>
        </div>
      )}

      {/* ── Docker Deploy wizard link ───────────────────── */}
      <div style={{
        padding: "0.75rem 1rem",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "color-mix(in srgb, #F7BB2E 5%, var(--card))",
        marginBottom: "1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>Docker Deploy Wizard</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
            Deploy a new site to Fly.io with a few clicks — pick a template, configure, and go.
          </div>
        </div>
        <a
          href="/admin/deploy/docker"
          style={{
            padding: "0.35rem 0.8rem",
            borderRadius: 6,
            background: "#F7BB2E",
            color: "#0D0D0D",
            fontSize: "0.75rem",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Open Wizard
        </a>
      </div>

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
              Your site has a build pipeline and a connected GitHub account, so it will deploy to GitHub Pages automatically. Pick a different provider above to override.
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
              {config.deployProvider === "flyio" && "Docker-based rebuild on every deploy. Best for SSR apps (Next.js, Remix) that genuinely need Docker. Slow for content edits — use Fly.io Live for static sites."}
              {config.deployProvider === "flyio-live" && "Your site runs on Fly.io. The first deploy takes about a minute; every edit after goes live in under a second. Best for EU hosting."}
              {config.deployProvider === "cloudflare" && "Legacy webhook-only — just POSTs to a Cloudflare Pages deploy hook URL. Prefer 'Cloudflare Pages (direct)' for full integration."}
              {config.deployProvider === "cloudflare-pages" && "Direct Cloudflare Pages API upload. 300+ global edge PoPs, free tier covers most small sites. Fastest option for pure-static sites worldwide."}
              {config.deployProvider === "github-pages" && canAutoDeploy && "Ready to deploy — GitHub connected. A repository will be created automatically if needed, and your site files pushed to GitHub Pages in one click."}
              {config.deployProvider === "github-pages" && !canAutoDeploy && "Static files only. Connect GitHub above, or provide a token and repository manually."}
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
              {(config.deployProvider === "flyio" || config.deployProvider === "flyio-live") && (
                <a href="https://fly.io/dashboard/personal/tokens" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Get token <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
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
              {config.deployProvider === "flyio" || config.deployProvider === "flyio-live" ? "App name" : "Repository (owner/repo)"}
            </label>
            <input type="text" value={config.deployAppName} onChange={(e) => updateConfig((c) => ({ ...c, deployAppName: e.target.value }))}
              placeholder={config.deployProvider === "flyio" || config.deployProvider === "flyio-live" ? "my-app" : "owner/repo"} style={inputStyle} />
          </div>
        )}

        {(config.deployProvider === "flyio" || config.deployProvider === "flyio-live") && (
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

        {config.deployProvider === "flyio-live" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Region</label>
              <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
                Fly region code for the volume. Cannot be changed after first deploy.
              </p>
              <input type="text" value={config.deployFlyLiveRegion} onChange={(e) => updateConfig((c) => ({ ...c, deployFlyLiveRegion: e.target.value }))}
                placeholder="arn" style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Volume name</label>
              <input type="text" value={config.deployFlyLiveVolumeName} onChange={(e) => updateConfig((c) => ({ ...c, deployFlyLiveVolumeName: e.target.value }))}
                placeholder="site_data" style={inputStyle} />
            </div>
            {config.deployFlyLiveSyncSecret && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Sync secret status</label>
                <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
                  HMAC secret shared with the Fly container. Generated on first deploy. Rotate from the "Rebuild infrastructure" action (not yet in UI — use CLI or regenerate manually).
                </p>
                <div style={{
                  fontSize: "0.7rem", fontFamily: "monospace",
                  padding: "0.3rem 0.5rem", borderRadius: "4px",
                  background: "var(--muted)", color: "var(--muted-foreground)",
                }}>
                  {config.deployFlyLiveSyncSecret.slice(0, 12)}…{config.deployFlyLiveSyncSecret.slice(-4)} (configured)
                </div>
              </div>
            )}
          </>
        )}

        {config.deployProvider === "cloudflare-pages" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>API Token</label>
                <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Get token <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
                Permission: "Account → Cloudflare Pages → Edit"
              </p>
              <input type="password" value={config.deployApiToken} onChange={(e) => updateConfig((c) => ({ ...c, deployApiToken: e.target.value }))}
                placeholder="Token..." style={{ ...inputStyle, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Account ID</label>
              <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
                Cloudflare dashboard → right sidebar → Account ID
              </p>
              <input type="text" value={config.deployCloudflareAccountId} onChange={(e) => updateConfig((c) => ({ ...c, deployCloudflareAccountId: e.target.value }))}
                placeholder="abcdef0123456789..." style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Project name</label>
              <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
                Lowercase letters, digits, hyphens. Auto-created on first deploy if missing.
              </p>
              <input type="text" value={config.deployCloudflareProjectName} onChange={(e) => updateConfig((c) => ({ ...c, deployCloudflareProjectName: e.target.value }))}
                placeholder="my-site" style={inputStyle} />
            </div>
          </>
        )}
      </SettingsCard>

      {/* ── F133: Fly Live infrastructure status ────────── */}
      {config.deployProvider === "flyio-live" && !flyLiveStatus?.provisioned && (
        <>
          <SectionHeading>Infrastructure</SectionHeading>
          <SettingsCard>
            <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
              Not provisioned yet. Click <strong style={{ color: "var(--foreground)" }}>Deploy now</strong> below to spin up the Fly app and volume. After that, this card will show the server status and a <strong style={{ color: "var(--foreground)" }}>Rebuild infrastructure</strong> button.
            </div>
          </SettingsCard>
        </>
      )}

      {config.deployProvider === "flyio-live" && flyLiveStatus?.provisioned && (
        <div data-rebuild-infra-section>
          <SectionHeading>Infrastructure</SectionHeading>
          <SettingsCard>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 1rem", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--muted-foreground)" }}>Status</span>
              <span>
                {flyLiveStatus.reachable
                  ? <span style={{ color: "#16a34a" }}>● Reachable</span>
                  : <span style={{ color: "#dc2626" }}>● Unreachable — {flyLiveStatus.error ?? "no response"}</span>
                }
              </span>
              <span style={{ color: "var(--muted-foreground)" }}>Server version</span>
              <span style={{ fontFamily: "monospace" }}>
                {flyLiveStatus.version ?? "unknown"}
                {flyLiveStatus.isOutdated && (
                  <span style={{ marginLeft: "0.5rem", color: "#d97706", fontSize: "0.7rem" }}>
                    (admin bundles {flyLiveStatus.expectedVersion})
                  </span>
                )}
              </span>
              <span style={{ color: "var(--muted-foreground)" }}>Region</span>
              <span style={{ fontFamily: "monospace" }}>{flyLiveStatus.region}</span>
              <span style={{ color: "var(--muted-foreground)" }}>Volume</span>
              <span style={{ fontFamily: "monospace" }}>{flyLiveStatus.volumeName}</span>
              {flyLiveStatus.url && (
                <>
                  <span style={{ color: "var(--muted-foreground)" }}>URL</span>
                  <a href={flyLiveStatus.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>{flyLiveStatus.url}</a>
                </>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 500 }}>Rebuild infrastructure</div>
                <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}>
                  Pushes a fresh Docker image (web server + sync endpoint). Content on the volume is preserved. Takes ~60 s.
                </div>
              </div>
              {!rebuildConfirm && !rebuilding && (
                <button
                  onClick={() => setRebuildConfirm(true)}
                  style={{
                    padding: "0.35rem 0.8rem", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--foreground)", fontSize: "0.7rem",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Rebuild
                </button>
              )}
              {rebuildConfirm && !rebuilding && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Rebuild?</span>
                  <button onClick={handleRebuildInfra}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
                  <button onClick={() => setRebuildConfirm(false)}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                </div>
              )}
              {rebuilding && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                  <Loader2 className="animate-spin" style={{ width: "0.8rem", height: "0.8rem" }} />
                  Rebuilding...
                </div>
              )}
            </div>
            {rebuildMsg && (
              <div style={{
                marginTop: "0.5rem", fontSize: "0.7rem",
                padding: "0.4rem 0.6rem", borderRadius: "4px",
                background: "var(--muted)", color: "var(--muted-foreground)",
              }}>
                {rebuildMsg}
              </div>
            )}
          </SettingsCard>
        </div>
      )}

      {/* ── Connect GitHub (when needed and no token) ───── */}
      {effectiveProvider === "github-pages" && !hasGitHubToken && !needsToken && (
        <>
          <SectionHeading>GitHub Connection</SectionHeading>
          <SettingsCard>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: 0 }}>
                GitHub Pages hosts your site for free. Connect your GitHub account and the CMS will create a repository and deploy automatically.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--primary)", minWidth: "1.25rem" }}>1</span>
                  <div>
                    <p style={{ fontSize: "0.8rem", fontWeight: 500, margin: 0 }}>Have a GitHub account</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
                      Don&apos;t have one? <a href="https://github.com/signup" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", textDecoration: "none" }}>Create a free account →</a>
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--primary)", minWidth: "1.25rem" }}>2</span>
                  <div>
                    <p style={{ fontSize: "0.8rem", fontWeight: 500, margin: 0 }}>Connect your account</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
                      Authorizes the CMS to create a repository and push your site files.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--primary)", minWidth: "1.25rem" }}>3</span>
                  <div>
                    <p style={{ fontSize: "0.8rem", fontWeight: 500, margin: 0 }}>Click Deploy</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
                      The CMS creates the repo, builds your site, and enables GitHub Pages — all in one click.
                    </p>
                  </div>
                </div>
              </div>
              <a
                href="/api/auth/github"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.5rem 1.25rem", borderRadius: "7px", border: "none",
                  background: "#24292f", color: "#fff",
                  fontSize: "0.8rem", fontWeight: 600, textDecoration: "none",
                  cursor: "pointer", alignSelf: "flex-start",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
                Connect GitHub
              </a>
            </div>
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

      {/* ── Custom domain ────────────────────────────────── */}
      {["github-pages", "flyio", "flyio-live", "vercel", "netlify", "cloudflare-pages"].includes(effectiveProvider) && (
        <>
          <SectionHeading>Custom Domain</SectionHeading>
          <SettingsCard>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
              {effectiveProvider === "github-pages"
                ? <>Use your own domain instead of <code style={{ fontSize: "0.7rem" }}>username.github.io/repo/</code>. Set up a <strong>CNAME</strong> record:</>
                : <>Use your own domain instead of the default. Set up a <strong>CNAME</strong> record:</>
              }
            </p>
            <div style={{
              fontSize: "0.72rem", fontFamily: "monospace", padding: "0.4rem 0.6rem",
              borderRadius: "5px", background: "var(--background)", border: "1px solid var(--border)",
              color: "var(--foreground)", lineHeight: 1.6,
            }}>
              <span style={{ color: "var(--muted-foreground)" }}>Type:</span> CNAME<br />
              <span style={{ color: "var(--muted-foreground)" }}>Name:</span> {dnsStatus?.subdomain ?? "your-subdomain"}<br />
              <span style={{ color: "var(--muted-foreground)" }}>Target:</span> {dnsStatus?.expectedTarget ?? (
                effectiveProvider === "github-pages"
                  ? "your-username.github.io."
                  : effectiveProvider === "vercel"
                  ? "cname.vercel-dns.com."
                  : effectiveProvider === "cloudflare-pages"
                  ? `${config.deployCloudflareProjectName || "your-project"}.pages.dev.`
                  : effectiveProvider === "netlify"
                  ? `${config.deployAppName || "your-site"}.netlify.app.`
                  : `${config.deployAppName || "app"}.fly.dev.`
              )}
            </div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input
                type="text"
                value={config.deployCustomDomain}
                onChange={(e) => updateConfig((c) => ({ ...c, deployCustomDomain: e.target.value }))}
                placeholder="No custom domain — using default"
                style={{ ...inputStyle, flex: 1, fontStyle: config.deployCustomDomain ? "normal" : "italic" }}
              />
              {config.deployCustomDomain && (
                <CopyButton text={config.deployCustomDomain} />
              )}
            </div>

            {/* Suggestion chip — only when no value is set yet */}
            {!config.deployCustomDomain && (() => {
              const suggested = `${(config.deployAppName.split("/")[1] ?? "my-site").replace(/-site$/, "")}.webhouse.app`;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.65rem", color: "var(--muted-foreground)" }}>
                  <span>Suggestion:</span>
                  <button
                    type="button"
                    onClick={() => updateConfig((c) => ({ ...c, deployCustomDomain: suggested }))}
                    style={{
                      padding: "0.2rem 0.5rem", borderRadius: "4px",
                      background: "color-mix(in srgb, var(--primary) 15%, transparent)",
                      color: "var(--foreground)", border: "1px solid var(--border)",
                      fontSize: "0.65rem", fontFamily: "monospace",
                      cursor: "pointer",
                    }}
                  >
                    + Use {suggested}
                  </button>
                </div>
              );
            })()}

            {/* F133 — Live availability check as you type */}
            {dnsStatus?.available && config.deployCustomDomain && (
              <div style={{ fontSize: "0.65rem", marginTop: "-0.1rem" }}>
                {domainCheck.state === "checking" && (
                  <span style={{ color: "var(--muted-foreground)" }}>Checking availability…</span>
                )}
                {domainCheck.state === "available" && (
                  <span style={{ color: "#16a34a" }}>✓ {domainCheck.subdomain}.{domainCheck.zone} is available</span>
                )}
                {domainCheck.state === "ours" && (
                  <span style={{ color: "#16a34a" }}>✓ Already pointed to this site</span>
                )}
                {domainCheck.state === "taken" && (
                  <span style={{ color: "#dc2626" }}>
                    ✗ Already in use ({domainCheck.conflicts?.[0]?.type} → {domainCheck.conflicts?.[0]?.value}). Pick a different subdomain.
                  </span>
                )}
                {domainCheck.state === "no-zone" && (
                  <span style={{ color: "var(--muted-foreground)" }}>
                    Zone {domainCheck.zone} not managed here — set the CNAME at your registrar.
                  </span>
                )}
                {domainCheck.state === "invalid" && config.deployCustomDomain.includes(".") && (
                  <span style={{ color: "var(--muted-foreground)" }}>Invalid domain</span>
                )}
              </div>
            )}

            {/* F133 — Auto-create CNAME via DNS API (only when API is configured) */}
            {dnsStatus?.available && config.deployCustomDomain && (
              <div style={{
                marginTop: "0.4rem",
                padding: "0.5rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "var(--background)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    {dnsStatus.state === "ok" && <span style={{ color: "#16a34a" }}>● CNAME record live</span>}
                    {dnsStatus.state === "missing" && <span style={{ color: "#d97706" }}>● CNAME record not yet created</span>}
                    {dnsStatus.state === "mismatch" && <span style={{ color: "#d97706" }}>● CNAME points elsewhere</span>}
                    {dnsStatus.state === "no-zone" && <span style={{ color: "var(--muted-foreground)" }}>● Zone not managed by webhouse DNS — set this CNAME manually at your registrar</span>}
                    {dnsStatus.state === "no-target" && <span style={{ color: "var(--muted-foreground)" }}>● Configure the deploy provider before creating the CNAME</span>}
                  </div>
                  {dnsStatus.currentTarget && dnsStatus.state === "mismatch" && (
                    <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "0.2rem", fontFamily: "monospace" }}>
                      Current: {dnsStatus.currentTarget} → Expected: {dnsStatus.expectedTarget}
                    </div>
                  )}
                </div>
                {dnsStatus.zoneManagedByApi && dnsStatus.expectedTarget && dnsStatus.state !== "ok" && (
                  <button
                    onClick={handleCreateCname}
                    disabled={dnsBusy || domainCheck.state === "taken"}
                    title={domainCheck.state === "taken" ? "Subdomain is already used by another site" : undefined}
                    style={{
                      padding: "0.35rem 0.7rem", borderRadius: "5px",
                      background: domainCheck.state === "taken" ? "var(--muted)" : "var(--primary)",
                      color: domainCheck.state === "taken" ? "var(--muted-foreground)" : "#0D0D0D",
                      border: "none", fontSize: "0.7rem", fontWeight: 600,
                      cursor: dnsBusy || domainCheck.state === "taken" ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                      opacity: dnsBusy ? 0.6 : 1,
                    }}
                  >
                    {dnsBusy ? "..." : dnsStatus.state === "mismatch" ? "Update CNAME" : "Create CNAME"}
                  </button>
                )}
                {dnsStatus.zoneManagedByApi && dnsStatus.state === "ok" && (
                  <RecheckButton
                    busy={dnsRecheckBusy}
                    justRan={dnsRecheckedAt !== null && Date.now() - dnsRecheckedAt < 2500}
                    onClick={async () => {
                      setDnsRecheckBusy(true);
                      try {
                        await loadDnsStatus();
                        setDnsRecheckedAt(Date.now());
                      } finally {
                        setDnsRecheckBusy(false);
                      }
                    }}
                  />
                )}
              </div>
            )}
            {dnsMsg && (
              <div style={{
                fontSize: "0.65rem", color: "var(--muted-foreground)",
                padding: "0.3rem 0.5rem", borderRadius: "4px",
                background: "var(--muted)", marginTop: "0.3rem",
              }}>
                {dnsMsg}
              </div>
            )}

            {config.deployCustomDomain && (
              <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: "0.4rem 0 0" }}>
                Deploys will serve on <strong>{config.deployCustomDomain}</strong> with root paths.
              </p>
            )}
          </SettingsCard>
        </>
      )}

      {/* ── Domain Registrar (only when DNS API configured) ─────────── */}
      {dnsStatus?.available && ["github-pages", "flyio", "flyio-live", "vercel", "netlify", "cloudflare-pages"].includes(effectiveProvider) && (
        <>
          <SectionHeading>Register a Domain</SectionHeading>
          <SettingsCard>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
              Search for and register a new domain via Cloudflare Registrar. Purchases are non-refundable and billed immediately.
            </p>

            {registrarDone && (
              <div style={{
                fontSize: "0.75rem", color: "#16a34a", fontWeight: 500,
                padding: "0.5rem 0.7rem", borderRadius: "6px",
                background: "color-mix(in srgb, #16a34a 12%, transparent)",
                border: "1px solid color-mix(in srgb, #16a34a 30%, transparent)",
                display: "flex", alignItems: "center", gap: "0.4rem",
              }}>
                <Check style={{ width: "0.85rem", height: "0.85rem", flexShrink: 0 }} />
                <strong>{registrarDone}</strong> registered successfully. It may take a few minutes to propagate.
              </div>
            )}

            {/* Search */}
            {!registrarPending && !registrarDone && (
              <>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <input
                    type="text"
                    value={registrarQuery}
                    onChange={(e) => setRegistrarQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRegistrarSearch()}
                    placeholder="Search domains — e.g. myblog"
                    style={{
                      flex: 1, fontSize: "0.8rem", padding: "0.45rem 0.65rem",
                      borderRadius: "5px", border: "1px solid var(--border)",
                      background: "var(--background)", color: "var(--foreground)",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleRegistrarSearch}
                    disabled={registrarSearching || !registrarQuery.trim()}
                    style={{
                      padding: "0.45rem 0.85rem", borderRadius: "5px",
                      background: "var(--primary)", color: "#0D0D0D",
                      border: "none", fontSize: "0.8rem", fontWeight: 600,
                      cursor: registrarSearching || !registrarQuery.trim() ? "not-allowed" : "pointer",
                      opacity: registrarSearching || !registrarQuery.trim() ? 0.6 : 1,
                      display: "flex", alignItems: "center", gap: "0.35rem",
                    }}
                  >
                    {registrarSearching
                      ? <Loader2 className="animate-spin" style={{ width: "0.8rem", height: "0.8rem" }} />
                      : <Search style={{ width: "0.8rem", height: "0.8rem" }} />}
                    {registrarSearching ? "Searching..." : "Search"}
                  </button>
                </div>

                {registrarError && (
                  <div style={{ fontSize: "0.65rem", color: "var(--destructive)", padding: "0.3rem 0" }}>
                    {registrarError}
                  </div>
                )}

                {registrarResults.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                    {registrarResults.map((r) => (
                      <div key={r.name} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "0.45rem 0", borderBottom: "1px solid var(--border)", gap: "0.5rem",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
                          <Globe style={{ width: "0.8rem", height: "0.8rem", color: r.registrable ? "#16a34a" : "var(--muted-foreground)", flexShrink: 0 }} />
                          <span style={{ fontSize: "0.8rem", fontFamily: "monospace", fontWeight: r.registrable ? 500 : 400 }}>
                            {r.name}
                          </span>
                          {!r.registrable && (
                            <span style={{ fontSize: "0.6rem", color: "var(--muted-foreground)" }}>taken</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                          {r.pricing && r.registrable && (
                            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
                              {r.pricing.currency} {r.pricing.registration_cost}/yr
                            </span>
                          )}
                          {r.registrable && (
                            <button
                              onClick={() => handleRegistrarInitiate(r.name)}
                              style={{
                                padding: "0.25rem 0.55rem", borderRadius: "4px",
                                background: "var(--primary)", color: "#0D0D0D",
                                border: "none", fontSize: "0.65rem", fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Register
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Confirm purchase */}
            {registrarPending && (
              <div style={{
                padding: "0.75rem", borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "var(--background)",
                display: "flex", flexDirection: "column", gap: "0.5rem",
              }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600 }}>Confirm purchase</div>
                <div style={{ fontSize: "0.8rem" }}>
                  Domain: <strong style={{ fontFamily: "monospace" }}>{registrarPending.domain_name}</strong>
                </div>
                <div style={{ fontSize: "0.8rem" }}>
                  Price: <strong>{registrarPending.currency} {registrarPending.price}/yr</strong>
                </div>
                <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
                  This purchase is <strong>non-refundable</strong> and will be charged immediately to the Cloudflare account.
                </p>
                {registrarError && (
                  <div style={{ fontSize: "0.65rem", color: "var(--destructive)" }}>{registrarError}</div>
                )}
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <button
                    onClick={handleRegistrarConfirm}
                    disabled={registrarConfirming}
                    style={{
                      padding: "0.35rem 0.8rem", borderRadius: "5px",
                      background: "var(--primary)", color: "#0D0D0D",
                      border: "none", fontSize: "0.75rem", fontWeight: 600,
                      cursor: registrarConfirming ? "wait" : "pointer",
                      opacity: registrarConfirming ? 0.7 : 1,
                      display: "flex", alignItems: "center", gap: "0.35rem",
                    }}
                  >
                    {registrarConfirming && <Loader2 className="animate-spin" style={{ width: "0.75rem", height: "0.75rem" }} />}
                    {registrarConfirming ? "Registering..." : "Yes, register domain"}
                  </button>
                  <button
                    onClick={() => { setRegistrarPending(null); setRegistrarError(null); }}
                    style={{
                      padding: "0.35rem 0.7rem", borderRadius: "5px",
                      background: "transparent", color: "var(--foreground)",
                      border: "1px solid var(--border)", fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
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
