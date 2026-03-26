"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";
import { ExternalLink } from "lucide-react";

interface OrgEntry {
  id: string;
  name: string;
  type?: string;
  plan?: string;
  sites: { id: string; name: string }[];
}

interface Registry {
  orgs: OrgEntry[];
  defaultOrgId: string;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

type OrgTab = "general" | "deploy" | "ai" | "email" | "automation";

interface OrgCreds {
  // Deploy
  deployApiToken: string;
  deployFlyOrg: string;
  deployVercelHookUrl: string;
  deployNetlifyHookUrl: string;
  deployCloudflareHookUrl: string;
  deployGitHubToken: string;
  // AI providers & keys
  aiDefaultProvider: string;
  aiAnthropicApiKey: string;
  aiOpenaiApiKey: string;
  aiGeminiApiKey: string;
  aiWebSearchProvider: string;
  aiBraveApiKey: string;
  aiTavilyApiKey: string;
  // AI model defaults
  aiContentModel: string;
  aiContentMaxTokens: number;
  aiInteractivesModel: string;
  aiInteractivesMaxTokens: number;
  // Email
  resendApiKey: string;
  emailFrom: string;
  emailFromName: string;
  // Automation
  backupSchedule: string;
  backupTime: string;
  backupRetentionDays: number;
  linkCheckSchedule: string;
  linkCheckTime: string;
  // AI Image Analysis
  aiImageOverwrite: string;
}

const CREDS_DEFAULTS: OrgCreds = {
  deployApiToken: "",
  deployFlyOrg: "",
  deployVercelHookUrl: "",
  deployNetlifyHookUrl: "",
  deployCloudflareHookUrl: "",
  deployGitHubToken: "",
  aiDefaultProvider: "",
  aiAnthropicApiKey: "",
  aiOpenaiApiKey: "",
  aiGeminiApiKey: "",
  aiWebSearchProvider: "",
  aiBraveApiKey: "",
  aiTavilyApiKey: "",
  aiContentModel: "",
  aiContentMaxTokens: 0,
  aiInteractivesModel: "",
  aiInteractivesMaxTokens: 0,
  resendApiKey: "",
  emailFrom: "",
  emailFromName: "",
  backupSchedule: "",
  backupTime: "",
  backupRetentionDays: 0,
  linkCheckSchedule: "",
  linkCheckTime: "",
  aiImageOverwrite: "",
};

export default function OrgSettingsPage() {
  const router = useRouter();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [activeOrgId, setActiveOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("personal");
  const [orgPlan, setOrgPlan] = useState("free");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<OrgTab>("general");
  // Org credentials (F87)
  const [creds, setCreds] = useState<OrgCreds>(CREDS_DEFAULTS);
  const [credsSaving, setCredsSaving] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);
  // Delete org
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteCode] = useState(() => Math.random().toString(36).slice(2, 14));

  useEffect(() => {
    fetch("/api/cms/registry")
      .then((r) => r.json())
      .then((d: { registry: Registry | null }) => {
        if (d.registry) {
          setRegistry(d.registry);
          const orgId = getCookie("cms-active-org") ?? d.registry.defaultOrgId;
          setActiveOrgId(orgId);
          const org = d.registry.orgs.find((o) => o.id === orgId);
          if (org) {
            setOrgName(org.name);
            setOrgType(org.type ?? "personal");
            setOrgPlan(org.plan ?? "free");
          }
        }
      })
      .finally(() => setLoaded(true));

    // Load org credentials
    fetch("/api/admin/org-settings")
      .then((r) => r.ok ? r.json() : {})
      .then((data: Record<string, unknown>) => {
        const s = (k: string) => (data[k] as string) ?? "";
        const n = (k: string) => (data[k] as number) ?? 0;
        setCreds({
          deployApiToken: s("deployApiToken"), deployFlyOrg: s("deployFlyOrg"),
          deployVercelHookUrl: s("deployVercelHookUrl"), deployNetlifyHookUrl: s("deployNetlifyHookUrl"),
          deployCloudflareHookUrl: s("deployCloudflareHookUrl"),
          deployGitHubToken: s("deployGitHubToken"),
          aiDefaultProvider: s("aiDefaultProvider"), aiAnthropicApiKey: s("aiAnthropicApiKey"),
          aiOpenaiApiKey: s("aiOpenaiApiKey"), aiGeminiApiKey: s("aiGeminiApiKey"),
          aiWebSearchProvider: s("aiWebSearchProvider"), aiBraveApiKey: s("aiBraveApiKey"),
          aiTavilyApiKey: s("aiTavilyApiKey"),
          aiContentModel: s("aiContentModel"), aiContentMaxTokens: n("aiContentMaxTokens"),
          aiInteractivesModel: s("aiInteractivesModel"), aiInteractivesMaxTokens: n("aiInteractivesMaxTokens"),
          resendApiKey: s("resendApiKey"), emailFrom: s("emailFrom"), emailFromName: s("emailFromName"),
          backupSchedule: s("backupSchedule"), backupTime: s("backupTime"),
          backupRetentionDays: n("backupRetentionDays"),
          linkCheckSchedule: s("linkCheckSchedule"), linkCheckTime: s("linkCheckTime"),
          aiImageOverwrite: s("aiImageOverwrite"),
        });
      })
      .catch(() => {});
  }, []);

  const handleSaveCreds = useCallback(async () => {
    setCredsSaving(true);
    // Only send non-empty values
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(creds)) {
      if (v !== "" && v !== 0) patch[k] = v;
    }
    await fetch("/api/admin/org-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setCredsSaving(false);
    setCredsSaved(true);
    setTimeout(() => setCredsSaved(false), 2000);
  }, [creds]);

  const activeOrg = registry?.orgs.find((o) => o.id === activeOrgId);

  async function handleSave() {
    if (!registry || !activeOrg) return;
    setSaving(true);
    await fetch("/api/cms/registry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-org",
        orgId: activeOrgId,
        orgName: orgName.trim() || activeOrg.name,
        orgType,
        orgPlan,
      }),
    });
    // Update local state
    setRegistry({
      ...registry,
      orgs: registry.orgs.map((o) =>
        o.id === activeOrgId ? { ...o, name: orgName.trim() || o.name, type: orgType, plan: orgPlan } : o
      ),
    });
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!loaded) {
    return (
      <div style={{ padding: "4rem 2rem" }}>
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Loading...</p>
      </div>
    );
  }

  if (!activeOrg) {
    return (
      <div style={{ padding: "4rem 2rem" }}>
        <p style={{ color: "var(--muted-foreground)" }}>Organization not found.</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.6rem 0.75rem", borderRadius: "6px",
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
  };

  const configuredBadge = (value: string | number) => {
    if (!value || value === 0) return null;
    return (
      <span style={{
        fontSize: "0.65rem", fontFamily: "monospace",
        padding: "0.1rem 0.4rem", borderRadius: "4px",
        background: "color-mix(in srgb, var(--primary) 10%, transparent)",
        color: "var(--primary)",
      }}>configured</span>
    );
  };

  const tabStyle = (t: OrgTab): React.CSSProperties => ({
    padding: "0.5rem 0.75rem", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
    border: "none", borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
    background: "transparent", color: tab === t ? "var(--foreground)" : "var(--muted-foreground)",
    transition: "all 0.15s",
  });

  const credInputStyle: React.CSSProperties = {
    width: "100%", padding: "0.45rem 0.75rem", borderRadius: "7px",
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace",
    boxSizing: "border-box",
  };

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-2">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Organization Settings</p>
        <h1 className="text-2xl font-bold text-foreground">{activeOrg.name}</h1>
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
          Organization configuration and shared credentials
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: "1px solid var(--border)", marginTop: "1.5rem", marginBottom: "1.5rem" }}>
        <button type="button" style={tabStyle("general")} onClick={() => setTab("general")}>General</button>
        <button type="button" style={tabStyle("deploy")} onClick={() => setTab("deploy")}>Deploy</button>
        <button type="button" style={tabStyle("ai")} onClick={() => setTab("ai")}>AI</button>
        <button type="button" style={tabStyle("email")} onClick={() => setTab("email")}>Email</button>
        <button type="button" style={tabStyle("automation")} onClick={() => setTab("automation")}>Automation</button>
      </div>

      {/* ── Save button (shared across all non-general tabs) ── */}
      {tab !== "general" && (
        <div style={{ display: "flex", justifyContent: "flex-end", position: "sticky", top: "0.5rem", zIndex: 10, marginBottom: "1rem" }}>
          <button type="button" onClick={handleSaveCreds} disabled={credsSaving}
            style={{ padding: "0.45rem 1rem", borderRadius: "6px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.8rem", fontWeight: 600, cursor: credsSaving ? "wait" : "pointer" }}>
            {credsSaving ? "Saving..." : credsSaved ? "Saved" : "Save"}
          </button>
        </div>
      )}

      {/* Shared description for non-general tabs */}
      {tab !== "general" && (
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
          Shared across all sites in <strong>{activeOrg.name}</strong>. Each site can override in its own Site Settings.
        </p>
      )}

      {/* ── Deploy tab ──────────────────────────────────────── */}
      {tab === "deploy" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Fly.io API Token</label>{configuredBadge(creds.deployApiToken)}</span>
              <a href="https://fly.io/dashboard" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>fly.io/dashboard <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input type="password" value={creds.deployApiToken} onChange={(e) => setCreds((c) => ({ ...c, deployApiToken: e.target.value }))}
              placeholder="FlyV1 ..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Fly.io Organization</label>
            <input type="text" value={creds.deployFlyOrg} onChange={(e) => setCreds((c) => ({ ...c, deployFlyOrg: e.target.value }))}
              placeholder="Auto-detect from token" style={credInputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>GitHub Personal Access Token</label>{configuredBadge(creds.deployGitHubToken)}</span>
              <a href="https://github.com/settings/tokens/new?scopes=repo&description=webhouse-deploy" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Create token <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input type="password" value={creds.deployGitHubToken} onChange={(e) => setCreds((c) => ({ ...c, deployGitHubToken: e.target.value }))}
              placeholder="ghp_..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Vercel Deploy Hook</label>{configuredBadge(creds.deployVercelHookUrl)}</span>
              <a href="https://vercel.com/docs/deploy-hooks" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Docs <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input type="url" value={creds.deployVercelHookUrl} onChange={(e) => setCreds((c) => ({ ...c, deployVercelHookUrl: e.target.value }))}
              placeholder="https://api.vercel.com/v1/integrations/deploy/..." style={credInputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Netlify Build Hook</label>{configuredBadge(creds.deployNetlifyHookUrl)}</span>
              <a href="https://docs.netlify.com/configure-builds/build-hooks/" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Docs <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input type="url" value={creds.deployNetlifyHookUrl} onChange={(e) => setCreds((c) => ({ ...c, deployNetlifyHookUrl: e.target.value }))}
              placeholder="https://api.netlify.com/build_hooks/..." style={credInputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Cloudflare Pages Deploy Hook</label>{configuredBadge(creds.deployCloudflareHookUrl)}</span>
              <a href="https://developers.cloudflare.com/pages/configuration/deploy-hooks/" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Docs <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input type="url" value={creds.deployCloudflareHookUrl} onChange={(e) => setCreds((c) => ({ ...c, deployCloudflareHookUrl: e.target.value }))}
              placeholder="https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/..." style={credInputStyle} />
          </div>
        </div>
      )}

      {/* ── AI tab ───────────────────────────────────────────── */}
      {tab === "ai" && (
        <>
          {/* API Keys */}
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>API Keys</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Anthropic API Key</label>{configuredBadge(creds.aiAnthropicApiKey)}</span>
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Get key <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <input type="password" value={creds.aiAnthropicApiKey} onChange={(e) => setCreds((c) => ({ ...c, aiAnthropicApiKey: e.target.value }))}
                placeholder="sk-ant-..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>OpenAI API Key</label>{configuredBadge(creds.aiOpenaiApiKey)}</span>
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Get key <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <input type="password" value={creds.aiOpenaiApiKey} onChange={(e) => setCreds((c) => ({ ...c, aiOpenaiApiKey: e.target.value }))}
                placeholder="sk-..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Google Gemini API Key</label>{configuredBadge(creds.aiGeminiApiKey)}</span>
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Get key <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <input type="password" value={creds.aiGeminiApiKey} onChange={(e) => setCreds((c) => ({ ...c, aiGeminiApiKey: e.target.value }))}
                placeholder="AI..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
          </div>

          {/* Web Search */}
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>Web Search</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {(["brave", "tavily"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setCreds((c) => ({ ...c, aiWebSearchProvider: p }))}
                  style={{ padding: "0.35rem 0.75rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                    border: creds.aiWebSearchProvider === p ? "1px solid var(--primary)" : "1px solid var(--border)",
                    background: creds.aiWebSearchProvider === p ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent",
                    color: creds.aiWebSearchProvider === p ? "var(--primary)" : "var(--muted-foreground)",
                  }}>{p === "brave" ? "Brave Search" : "Tavily"}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Brave Search API Key</label>{configuredBadge(creds.aiBraveApiKey)}</span>
                <a href="https://brave.com/search/api/" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Get key <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <input type="password" value={creds.aiBraveApiKey} onChange={(e) => setCreds((c) => ({ ...c, aiBraveApiKey: e.target.value }))}
                placeholder="BSA..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Tavily API Key</label>{configuredBadge(creds.aiTavilyApiKey)}</span>
                <a href="https://tavily.com/" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>Get key <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <input type="password" value={creds.aiTavilyApiKey} onChange={(e) => setCreds((c) => ({ ...c, aiTavilyApiKey: e.target.value }))}
                placeholder="tvly-..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
          </div>

          {/* Model Defaults */}
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>Model Defaults</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Content writing model</label>
                <input type="text" value={creds.aiContentModel} onChange={(e) => setCreds((c) => ({ ...c, aiContentModel: e.target.value }))}
                  placeholder="claude-haiku-4-5-20251001" style={credInputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Max tokens</label>
                <input type="number" value={creds.aiContentMaxTokens || ""} onChange={(e) => setCreds((c) => ({ ...c, aiContentMaxTokens: parseInt(e.target.value) || 0 }))}
                  placeholder="4096" style={credInputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Interactives model</label>
                <input type="text" value={creds.aiInteractivesModel} onChange={(e) => setCreds((c) => ({ ...c, aiInteractivesModel: e.target.value }))}
                  placeholder="claude-sonnet-4-6" style={credInputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Max tokens</label>
                <input type="number" value={creds.aiInteractivesMaxTokens || ""} onChange={(e) => setCreds((c) => ({ ...c, aiInteractivesMaxTokens: parseInt(e.target.value) || 0 }))}
                  placeholder="16384" style={credInputStyle} />
              </div>
            </div>

            {/* AI Image Analysis */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.25rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Image Analysis — batch overwrite</label>
              <p style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", margin: "0.25rem 0 0.5rem" }}>
                Default for all sites in this org. Sites can override.
              </p>
              <select
                value={creds.aiImageOverwrite}
                onChange={(e) => setCreds((c) => ({ ...c, aiImageOverwrite: e.target.value }))}
                style={{ ...credInputStyle, fontFamily: "inherit", cursor: "pointer" }}
              >
                <option value="">Inherit default (ask)</option>
                <option value="ask">Ask each time</option>
                <option value="skip">Skip already analyzed</option>
                <option value="overwrite">Always re-analyze</option>
              </select>
            </div>
          </div>
        </>
      )}

      {/* ── Email tab ─────────────────────────────────────────── */}
      {tab === "email" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Resend API Key</label>{configuredBadge(creds.resendApiKey)}</span>
              <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>resend.com <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input type="password" value={creds.resendApiKey} onChange={(e) => setCreds((c) => ({ ...c, resendApiKey: e.target.value }))}
              placeholder="re_..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Sender email address</label>
            <input type="email" value={creds.emailFrom} onChange={(e) => setCreds((c) => ({ ...c, emailFrom: e.target.value }))}
              placeholder="noreply@example.com" style={credInputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Sender display name</label>
            <input type="text" value={creds.emailFromName} onChange={(e) => setCreds((c) => ({ ...c, emailFromName: e.target.value }))}
              placeholder="webhouse.app" style={{ ...credInputStyle, fontFamily: "inherit" }} />
          </div>
        </div>
      )}

      {/* ── Automation tab ────────────────────────────────────── */}
      {tab === "automation" && (
        <>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>Backup Defaults</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Backup schedule</label>
                <CustomSelect value={creds.backupSchedule || "off"} onChange={(v) => setCreds((c) => ({ ...c, backupSchedule: v }))}
                  options={[{ value: "off", label: "Off" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }]} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Backup time</label>
                <input type="time" value={creds.backupTime} onChange={(e) => setCreds((c) => ({ ...c, backupTime: e.target.value }))}
                  style={credInputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Retention (days)</label>
                <input type="number" value={creds.backupRetentionDays || ""} onChange={(e) => setCreds((c) => ({ ...c, backupRetentionDays: parseInt(e.target.value) || 0 }))}
                  placeholder="30" style={credInputStyle} />
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>Link Checker Defaults</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Link check schedule</label>
                <CustomSelect value={creds.linkCheckSchedule || "off"} onChange={(v) => setCreds((c) => ({ ...c, linkCheckSchedule: v }))}
                  options={[{ value: "off", label: "Off" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }]} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Link check time</label>
                <input type="time" value={creds.linkCheckTime} onChange={(e) => setCreds((c) => ({ ...c, linkCheckTime: e.target.value }))}
                  style={credInputStyle} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── General tab ─────────────────────────────────────── */}
      {tab === "general" && <>

      {/* Organization details */}
      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>Organization details</h2>
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "10px", overflow: "hidden",
        }}>
          {/* Name */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>Organization name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              style={{ ...inputStyle, maxWidth: "320px" }}
            />
          </div>
          {/* Slug */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>Organization slug</label>
            <div style={{ ...inputStyle, maxWidth: "320px", background: "var(--muted)", color: "var(--muted-foreground)", cursor: "default" }}>
              {activeOrgId}
            </div>
          </div>
          {/* Type */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>Type</label>
            <div style={{ maxWidth: "320px", width: "100%" }}>
              <CustomSelect
                options={[
                  { value: "agency", label: "Agency" },
                  { value: "company", label: "Company" },
                  { value: "personal", label: "Personal" },
                  { value: "freelancer", label: "Freelancer" },
                  { value: "nonprofit", label: "Non-profit" },
                ]}
                value={orgType}
                onChange={(v) => setOrgType(v)}
              />
            </div>
          </div>
          {/* Plan */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>Plan</label>
            <div style={{ maxWidth: "320px", width: "100%" }}>
              <CustomSelect
                options={[
                  { value: "free", label: "Free — $0/month" },
                  { value: "pro", label: "Pro — $25/month" },
                  { value: "team", label: "Team — $599/month" },
                ]}
                value={orgPlan}
                onChange={(v) => setOrgPlan(v)}
              />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button
            type="button"
            onClick={() => router.push("/admin/organizations")}
            style={{
              padding: "0.45rem 0.75rem", borderRadius: "6px",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--muted-foreground)", fontSize: "0.8rem", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "0.45rem 1rem", borderRadius: "6px", border: "none",
              background: "var(--primary)", color: "var(--primary-foreground)",
              fontSize: "0.8rem", fontWeight: 600, cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Sites in this org */}
      <div style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Sites</h2>
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          {activeOrg.sites.length} site{activeOrg.sites.length !== 1 ? "s" : ""} in this organization
        </p>
        {activeOrg.sites.length > 0 && (
          <div style={{
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: "10px", overflow: "hidden",
          }}>
            {activeOrg.sites.map((site, i) => (
              <div
                key={site.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0.75rem 1.25rem",
                  borderBottom: i < activeOrg.sites.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{site.name}</span>
                <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>{site.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--destructive)" }}>Danger zone</h2>
        <div style={{
          background: "var(--card)", border: "1px solid color-mix(in srgb, var(--destructive) 30%, var(--border))",
          borderRadius: "10px", padding: "1.25rem",
        }}>
          <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
            Deleting this organization will also remove its sites
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
            Make sure you have made a backup of your projects if you want to keep your data.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            style={{
              padding: "0.4rem 0.75rem", borderRadius: "6px", border: "none",
              background: "var(--destructive)", color: "#fff",
              fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
            }}
          >
            Delete organization
          </button>
        </div>
      </div>

      </>}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowDeleteDialog(false); setDeleteConfirm(""); } }}
        >
          <div style={{
            background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "12px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)", width: "min(440px, 90vw)", padding: "1.5rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Delete organization</h3>
              <button type="button" onClick={() => { setShowDeleteDialog(false); setDeleteConfirm(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.25rem" }}>×</button>
            </div>

            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
              This action <strong style={{ color: "var(--foreground)" }}>cannot</strong> be undone. This will permanently delete the <strong style={{ color: "var(--foreground)" }}>{activeOrg.name}</strong> organization and remove all of its sites.
            </p>

            <p style={{ fontSize: "0.8rem", marginBottom: "0.5rem", marginTop: "1rem" }}>
              Type <code style={{ background: "var(--muted)", padding: "0.15rem 0.4rem", borderRadius: "4px", fontSize: "0.75rem", fontFamily: "monospace" }}>{deleteCode}</code> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Enter the string above"
              autoFocus
              style={{
                width: "100%", padding: "0.5rem 0.6rem", borderRadius: "6px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
                marginBottom: "1rem",
              }}
            />
            <button
              type="button"
              disabled={deleteConfirm !== deleteCode || deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  const res = await fetch(`/api/cms/registry?orgId=${activeOrgId}`, { method: "DELETE" });
                  if (res.ok) {
                    // Switch to default org
                    document.cookie = "cms-active-org=;path=/;max-age=0";
                    document.cookie = "cms-active-site=;path=/;max-age=0";
                    window.dispatchEvent(new CustomEvent("cms-registry-change"));
                    router.push("/admin/organizations");
                    router.refresh();
                  }
                } finally {
                  setDeleting(false);
                }
              }}
              style={{
                width: "100%", padding: "0.6rem", borderRadius: "6px", border: "none",
                background: deleteConfirm === deleteCode ? "var(--destructive)" : "var(--muted)",
                color: deleteConfirm === deleteCode ? "#fff" : "var(--muted-foreground)",
                fontSize: "0.8rem", fontWeight: 600,
                cursor: deleteConfirm === deleteCode && !deleting ? "pointer" : "not-allowed",
              }}
            >
              {deleting ? "Deleting..." : "I understand, delete this organization"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
