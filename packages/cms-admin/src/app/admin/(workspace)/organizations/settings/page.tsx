"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useBrand } from "@/lib/brand-context";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomTimeInput } from "@/components/ui/custom-time-input";
import { CapabilitiesSettingsPanel } from "@/components/settings/capabilities-settings-panel";
import { ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n-context";
// Placeholders must name a model this CMS can actually run — every AI call is
// pinned to the Mistral (EU/GDPR) provider and there is no Anthropic adapter.
// The Claude ids that used to sit here are how two sites ended up with a stored
// model that 400s on every AI feature.
import { DEFAULTS } from "@/lib/ai/model-defaults";

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

/** Renders a translated sentence whose <b>…</b> / <code>…</code> parts carry markup. */
function renderMarked(text: string, boldStyle: React.CSSProperties | undefined, codeStyle: React.CSSProperties) {
  return text.split(/(<b>.*?<\/b>|<code>.*?<\/code>)/).map((part, i) => {
    if (part.startsWith("<b>")) return <strong key={i} style={boldStyle}>{part.slice(3, -4)}</strong>;
    if (part.startsWith("<code>")) return <code key={i} style={codeStyle}>{part.slice(6, -7)}</code>;
    return part;
  });
}

type OrgTab = "general" | "deploy" | "ai" | "email" | "automation" | "features";

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
  aiChatModel: string;
  aiChatMaxTokens: number;
  aiChatMaxToolIterations: number;
  // Email
  resendApiKey: string;
  emailFrom: string;
  emailFromName: string;
  emailAccentColor: string;
  emailAccentColor2: string;
  emailFooterName: string;
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
  aiChatModel: "",
  aiChatMaxTokens: 0,
  aiChatMaxToolIterations: 0,
  resendApiKey: "",
  emailFrom: "",
  emailFromName: "",
  emailAccentColor: "",
  emailAccentColor2: "",
  emailFooterName: "",
  backupSchedule: "",
  backupTime: "",
  backupRetentionDays: 0,
  linkCheckSchedule: "",
  linkCheckTime: "",
  aiImageOverwrite: "",
};

export default function OrgSettingsPage() {
  const t = useT();
  const brand = useBrand();
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
          aiChatModel: s("aiChatModel"), aiChatMaxTokens: n("aiChatMaxTokens"), aiChatMaxToolIterations: n("aiChatMaxToolIterations"),
          resendApiKey: s("resendApiKey"), emailFrom: s("emailFrom"), emailFromName: s("emailFromName"),
          emailAccentColor: s("emailAccentColor"), emailAccentColor2: s("emailAccentColor2"), emailFooterName: s("emailFooterName"),
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
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>{t("pages.orgSettings.loading")}</p>
      </div>
    );
  }

  if (!activeOrg) {
    return (
      <div style={{ padding: "4rem 2rem" }}>
        <p style={{ color: "var(--muted-foreground)" }}>{t("pages.orgSettings.notFound")}</p>
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
      }}>{t("pages.orgSettings.configured")}</span>
    );
  };

  const tabStyle = (tb: OrgTab): React.CSSProperties => ({
    padding: "0.5rem 0.75rem", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
    border: "none", borderBottom: tab === tb ? "2px solid var(--primary)" : "2px solid transparent",
    background: "transparent", color: tab === tb ? "var(--foreground)" : "var(--muted-foreground)",
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
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">{t("pages.orgSettings.eyebrow")}</p>
        <h1 className="text-2xl font-bold text-foreground">{activeOrg.name}</h1>
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
          {t("pages.orgSettings.subtitle")}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: "1px solid var(--border)", marginTop: "1.5rem", marginBottom: "1.5rem" }}>
        <button data-testid="org-settings-tab-general" type="button" style={tabStyle("general")} onClick={() => setTab("general")}>{t("pages.orgSettings.tabGeneral")}</button>
        <button data-testid="org-settings-tab-deploy" type="button" style={tabStyle("deploy")} onClick={() => setTab("deploy")}>{t("pages.orgSettings.tabDeploy")}</button>
        <button data-testid="org-settings-tab-ai" type="button" style={tabStyle("ai")} onClick={() => setTab("ai")}>{t("pages.orgSettings.tabAi")}</button>
        <button data-testid="org-settings-tab-email" type="button" style={tabStyle("email")} onClick={() => setTab("email")}>{t("pages.orgSettings.tabEmail")}</button>
        <button data-testid="org-settings-tab-automation" type="button" style={tabStyle("automation")} onClick={() => setTab("automation")}>{t("pages.orgSettings.tabAutomation")}</button>
        <button data-testid="org-settings-tab-features" type="button" style={tabStyle("features")} onClick={() => setTab("features")}>{t("pages.orgSettings.tabFeatures")}</button>
      </div>

      {/* ── Save button (shared across all non-general tabs) ── */}
      {tab !== "general" && (
        <div style={{ display: "flex", justifyContent: "flex-end", position: "sticky", top: "0.5rem", zIndex: 10, marginBottom: "1rem" }}>
          <button data-testid="org-settings-save-creds" type="button" onClick={handleSaveCreds} disabled={credsSaving}
            style={{ padding: "0.45rem 1rem", borderRadius: "6px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.8rem", fontWeight: 600, cursor: credsSaving ? "wait" : "pointer" }}>
            {credsSaving ? t("pages.orgSettings.saving") : credsSaved ? t("pages.orgSettings.saved") : t("pages.orgSettings.save")}
          </button>
        </div>
      )}

      {/* Shared description for non-general tabs */}
      {tab !== "general" && (
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
          {renderMarked(t("pages.orgSettings.sharedDesc", { name: activeOrg.name }), undefined, {})}
        </p>
      )}

      {/* ── Deploy tab ──────────────────────────────────────── */}
      {tab === "deploy" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.flyToken")}</label>{configuredBadge(creds.deployApiToken)}</span>
              <a data-testid="deploy-flyio-docs-link" href="https://fly.io/dashboard" target="_blank" rel="noopener noreferrer"
                /* i18n-ignore: domain name link text */
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>fly.io/dashboard <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input data-testid="deploy-flyio-api-token" type="password" value={creds.deployApiToken} onChange={(e) => setCreds((c) => ({ ...c, deployApiToken: e.target.value }))}
              /* i18n-ignore: credential format example placeholder */
              placeholder="FlyV1 ..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.flyOrg")}</label>
            <input data-testid="deploy-flyio-org" type="text" value={creds.deployFlyOrg} onChange={(e) => setCreds((c) => ({ ...c, deployFlyOrg: e.target.value }))}
              placeholder={t("pages.orgSettings.flyOrgPlaceholder")} style={credInputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.githubPat")}</label>{configuredBadge(creds.deployGitHubToken)}</span>
              <a data-testid="deploy-github-token-link" href="https://github.com/settings/tokens/new?scopes=repo&description=webhouse-deploy" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>{t("pages.orgSettings.createToken")} <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input data-testid="deploy-github-token" type="password" value={creds.deployGitHubToken} onChange={(e) => setCreds((c) => ({ ...c, deployGitHubToken: e.target.value }))}
              /* i18n-ignore: credential format example placeholder */
              placeholder="ghp_..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.vercelHook")}</label>{configuredBadge(creds.deployVercelHookUrl)}</span>
              <a data-testid="deploy-vercel-docs-link" href="https://vercel.com/docs/deploy-hooks" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>{t("pages.orgSettings.docs")} <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input data-testid="deploy-vercel-hook-url" type="url" value={creds.deployVercelHookUrl} onChange={(e) => setCreds((c) => ({ ...c, deployVercelHookUrl: e.target.value }))}
              /* i18n-ignore: example URL placeholder */
              placeholder="https://api.vercel.com/v1/integrations/deploy/..." style={credInputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.netlifyHook")}</label>{configuredBadge(creds.deployNetlifyHookUrl)}</span>
              <a data-testid="deploy-netlify-docs-link" href="https://docs.netlify.com/configure-builds/build-hooks/" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>{t("pages.orgSettings.docs")} <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input data-testid="deploy-netlify-hook-url" type="url" value={creds.deployNetlifyHookUrl} onChange={(e) => setCreds((c) => ({ ...c, deployNetlifyHookUrl: e.target.value }))}
              /* i18n-ignore: example URL placeholder */
              placeholder="https://api.netlify.com/build_hooks/..." style={credInputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.cloudflareHook")}</label>{configuredBadge(creds.deployCloudflareHookUrl)}</span>
              <a data-testid="deploy-cloudflare-docs-link" href="https://developers.cloudflare.com/pages/configuration/deploy-hooks/" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>{t("pages.orgSettings.docs")} <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input data-testid="deploy-cloudflare-hook-url" type="url" value={creds.deployCloudflareHookUrl} onChange={(e) => setCreds((c) => ({ ...c, deployCloudflareHookUrl: e.target.value }))}
              /* i18n-ignore: example URL placeholder */
              placeholder="https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/..." style={credInputStyle} />
          </div>
        </div>
      )}

      {/* ── AI tab ───────────────────────────────────────────── */}
      {tab === "ai" && (
        <>
          {/* API Keys */}
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>{t("pages.orgSettings.apiKeys")}</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.anthropicKey")}</label>{configuredBadge(creds.aiAnthropicApiKey)}</span>
                <a data-testid="ai-anthropic-key-link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>{t("pages.orgSettings.getKey")} <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <input data-testid="ai-anthropic-api-key" type="password" value={creds.aiAnthropicApiKey} onChange={(e) => setCreds((c) => ({ ...c, aiAnthropicApiKey: e.target.value }))}
                /* i18n-ignore: credential format example placeholder */
                placeholder="sk-ant-..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.openaiKey")}</label>{configuredBadge(creds.aiOpenaiApiKey)}</span>
                <a data-testid="ai-openai-key-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>{t("pages.orgSettings.getKey")} <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <input data-testid="ai-openai-api-key" type="password" value={creds.aiOpenaiApiKey} onChange={(e) => setCreds((c) => ({ ...c, aiOpenaiApiKey: e.target.value }))}
                /* i18n-ignore: credential format example placeholder */
                placeholder="sk-..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.geminiKey")}</label>{configuredBadge(creds.aiGeminiApiKey)}</span>
                <a data-testid="ai-gemini-key-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>{t("pages.orgSettings.getKey")} <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <input data-testid="ai-gemini-api-key" type="password" value={creds.aiGeminiApiKey} onChange={(e) => setCreds((c) => ({ ...c, aiGeminiApiKey: e.target.value }))}
                /* i18n-ignore: credential format example placeholder */
                placeholder="AI..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
          </div>

          {/* Web Search */}
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>{t("pages.orgSettings.webSearch")}</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {(["brave", "tavily"] as const).map((p) => (
                <button data-testid={`ai-web-search-${p}`} key={p} type="button" onClick={() => setCreds((c) => ({ ...c, aiWebSearchProvider: p }))}
                  style={{ padding: "0.35rem 0.75rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                    border: creds.aiWebSearchProvider === p ? "1px solid var(--primary)" : "1px solid var(--border)",
                    background: creds.aiWebSearchProvider === p ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent",
                    color: creds.aiWebSearchProvider === p ? "var(--primary)" : "var(--muted-foreground)",
                  /* i18n-ignore: provider brand names */
                  }}>{p === "brave" ? "Brave Search" : "Tavily"}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.braveKey")}</label>{configuredBadge(creds.aiBraveApiKey)}</span>
                <a data-testid="ai-brave-key-link" href="https://brave.com/search/api/" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>{t("pages.orgSettings.getKey")} <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <input data-testid="ai-brave-api-key" type="password" value={creds.aiBraveApiKey} onChange={(e) => setCreds((c) => ({ ...c, aiBraveApiKey: e.target.value }))}
                /* i18n-ignore: credential format example placeholder */
                placeholder="BSA..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.tavilyKey")}</label>{configuredBadge(creds.aiTavilyApiKey)}</span>
                <a data-testid="ai-tavily-key-link" href="https://tavily.com/" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>{t("pages.orgSettings.getKey")} <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
              </div>
              <input data-testid="ai-tavily-api-key" type="password" value={creds.aiTavilyApiKey} onChange={(e) => setCreds((c) => ({ ...c, aiTavilyApiKey: e.target.value }))}
                /* i18n-ignore: credential format example placeholder */
                placeholder="tvly-..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
          </div>

          {/* Model Defaults */}
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>{t("pages.orgSettings.modelDefaults")}</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.contentModel")}</label>
                <input data-testid="ai-content-model" type="text" value={creds.aiContentModel} onChange={(e) => setCreds((c) => ({ ...c, aiContentModel: e.target.value }))}
                  placeholder={DEFAULTS.content} style={credInputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.maxTokens")}</label>
                <input data-testid="ai-content-max-tokens" type="number" value={creds.aiContentMaxTokens || ""} onChange={(e) => setCreds((c) => ({ ...c, aiContentMaxTokens: parseInt(e.target.value) || 0 }))}
                  placeholder="4096" style={credInputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.interactivesModel")}</label>
                <input data-testid="ai-interactives-model" type="text" value={creds.aiInteractivesModel} onChange={(e) => setCreds((c) => ({ ...c, aiInteractivesModel: e.target.value }))}
                  placeholder={DEFAULTS.code} style={credInputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.maxTokens")}</label>
                <input data-testid="ai-interactives-max-tokens" type="number" value={creds.aiInteractivesMaxTokens || ""} onChange={(e) => setCreds((c) => ({ ...c, aiInteractivesMaxTokens: parseInt(e.target.value) || 0 }))}
                  placeholder="16384" style={credInputStyle} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.chatModel")}</label>
                <input data-testid="ai-chat-model" type="text" value={creds.aiChatModel} onChange={(e) => setCreds((c) => ({ ...c, aiChatModel: e.target.value }))}
                  placeholder={DEFAULTS.code} style={credInputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.maxTokens")}</label>
                <input data-testid="ai-chat-max-tokens" type="number" value={creds.aiChatMaxTokens || ""} onChange={(e) => setCreds((c) => ({ ...c, aiChatMaxTokens: parseInt(e.target.value) || 0 }))}
                  placeholder="8192" style={credInputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.toolIterations")}</label>
                <input data-testid="ai-chat-max-tool-iterations" type="number" value={creds.aiChatMaxToolIterations || ""} onChange={(e) => setCreds((c) => ({ ...c, aiChatMaxToolIterations: parseInt(e.target.value) || 0 }))}
                  placeholder="25" style={credInputStyle} />
              </div>
            </div>

            {/* AI Image Analysis */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.25rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.imageOverwrite")}</label>
              <p style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", margin: "0.25rem 0 0.5rem" }}>
                {t("pages.orgSettings.imageOverwriteHint")}
              </p>
              <select data-testid="ai-image-overwrite"
                value={creds.aiImageOverwrite}
                onChange={(e) => setCreds((c) => ({ ...c, aiImageOverwrite: e.target.value }))}
                style={{ ...credInputStyle, fontFamily: "inherit", cursor: "pointer" }}
              >
                <option value="">{t("pages.orgSettings.optInherit")}</option>
                <option value="ask">{t("pages.orgSettings.optAsk")}</option>
                <option value="skip">{t("pages.orgSettings.optSkip")}</option>
                <option value="overwrite">{t("pages.orgSettings.optOverwrite")}</option>
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
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.resendKey")}</label>{configuredBadge(creds.resendApiKey)}</span>
              <a data-testid="email-resend-link" href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer"
                /* i18n-ignore: domain name link text */
                style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>resend.com <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} /></a>
            </div>
            <input data-testid="email-resend-api-key" type="password" value={creds.resendApiKey} onChange={(e) => setCreds((c) => ({ ...c, resendApiKey: e.target.value }))}
              /* i18n-ignore: credential format example placeholder */
              placeholder="re_..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.senderEmail")}</label>
            <input data-testid="email-from-address" type="email" value={creds.emailFrom} onChange={(e) => setCreds((c) => ({ ...c, emailFrom: e.target.value }))}
              /* i18n-ignore: example e-mail address placeholder */
              placeholder="noreply@example.com" style={credInputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.senderName")}</label>
            <input data-testid="email-from-name" type="text" value={creds.emailFromName} onChange={(e) => setCreds((c) => ({ ...c, emailFromName: e.target.value }))}
              placeholder={brand.name} style={{ ...credInputStyle, fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.accent1")}</label>
              <input data-testid="email-accent-color" type="text" value={creds.emailAccentColor} onChange={(e) => setCreds((c) => ({ ...c, emailAccentColor: e.target.value }))}
                /* i18n-ignore: hex colour placeholder */
                placeholder="#F7BB2E" style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.accent2")}</label>
              <input data-testid="email-accent-color-2" type="text" value={creds.emailAccentColor2} onChange={(e) => setCreds((c) => ({ ...c, emailAccentColor2: e.target.value }))}
                /* i18n-ignore: hex colour placeholder */
                placeholder="#f59e0b" style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.footerName")}</label>
            <input data-testid="email-footer-name" type="text" value={creds.emailFooterName} onChange={(e) => setCreds((c) => ({ ...c, emailFooterName: e.target.value }))}
              placeholder={brand.name} style={{ ...credInputStyle, fontFamily: "inherit" }} />
          </div>
        </div>
      )}

      {/* ── Automation tab ────────────────────────────────────── */}
      {tab === "automation" && (
        <>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>{t("pages.orgSettings.backupDefaults")}</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.backupSchedule")}</label>
                <CustomSelect data-testid="automation-backup-schedule" value={creds.backupSchedule || "off"} onChange={(v) => setCreds((c) => ({ ...c, backupSchedule: v }))}
                  options={[{ value: "off", label: t("pages.orgSettings.off") }, { value: "daily", label: t("pages.orgSettings.daily") }, { value: "weekly", label: t("pages.orgSettings.weekly") }]} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.backupTime")}</label>
                <CustomTimeInput data-testid="automation-backup-time" value={creds.backupTime} onChange={(v) => setCreds((c) => ({ ...c, backupTime: v }))} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.retention")}</label>
                <input data-testid="automation-backup-retention" type="number" value={creds.backupRetentionDays || ""} onChange={(e) => setCreds((c) => ({ ...c, backupRetentionDays: parseInt(e.target.value) || 0 }))}
                  placeholder="30" style={credInputStyle} />
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>{t("pages.orgSettings.linkCheckerDefaults")}</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.linkCheckSchedule")}</label>
                <CustomSelect data-testid="automation-link-check-schedule" value={creds.linkCheckSchedule || "off"} onChange={(v) => setCreds((c) => ({ ...c, linkCheckSchedule: v }))}
                  options={[{ value: "off", label: t("pages.orgSettings.off") }, { value: "daily", label: t("pages.orgSettings.daily") }, { value: "weekly", label: t("pages.orgSettings.weekly") }]} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("pages.orgSettings.linkCheckTime")}</label>
                <CustomTimeInput data-testid="automation-link-check-time" value={creds.linkCheckTime} onChange={(v) => setCreds((c) => ({ ...c, linkCheckTime: v }))} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── General tab ─────────────────────────────────────── */}
      {tab === "features" && (
        <div style={{ maxWidth: "32rem" }} data-testid="org-settings-panel-features">
          <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0 0 1rem" }}>
            {t("pages.orgSettings.featuresIntro")}
          </p>
          <CapabilitiesSettingsPanel endpoint="/api/admin/org-settings" selfSave />
        </div>
      )}

      {tab === "general" && <>

      {/* Organization details */}
      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>{t("pages.orgSettings.orgDetails")}</h2>
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "10px", overflow: "hidden",
        }}>
          {/* Name */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>{t("pages.orgSettings.orgName")}</label>
            <input data-testid="general-org-name"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              style={{ ...inputStyle, maxWidth: "320px" }}
            />
          </div>
          {/* Slug */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>{t("pages.orgSettings.orgSlug")}</label>
            <div style={{ ...inputStyle, maxWidth: "320px", background: "var(--muted)", color: "var(--muted-foreground)", cursor: "default" }}>
              {activeOrgId}
            </div>
          </div>
          {/* Type */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>{t("pages.orgNew.typeLabel")}</label>
            <div style={{ maxWidth: "320px", width: "100%" }}>
              <CustomSelect data-testid="general-org-type"
                options={[
                  { value: "agency", label: t("pages.orgNew.typeAgency") },
                  { value: "company", label: t("pages.orgNew.typeCompany") },
                  { value: "personal", label: t("pages.orgNew.typePersonal") },
                  { value: "freelancer", label: t("pages.orgNew.typeFreelancer") },
                  { value: "nonprofit", label: t("pages.orgNew.typeNonprofit") },
                ]}
                value={orgType}
                onChange={(v) => setOrgType(v)}
              />
            </div>
          </div>
          {/* Plan */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>{t("pages.orgNew.planLabel")}</label>
            <div style={{ maxWidth: "320px", width: "100%" }}>
              <CustomSelect data-testid="general-org-plan"
                options={[
                  { value: "free", label: t("pages.orgNew.planFree") },
                  { value: "pro", label: t("pages.orgNew.planPro") },
                  { value: "team", label: t("pages.orgNew.planTeam") },
                ]}
                value={orgPlan}
                onChange={(v) => setOrgPlan(v)}
              />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button data-testid="general-cancel"
            type="button"
            onClick={() => router.push("/admin/organizations")}
            style={{
              padding: "0.45rem 0.75rem", borderRadius: "6px",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--muted-foreground)", fontSize: "0.8rem", cursor: "pointer",
            }}
          >
            {t("pages.orgNew.cancel")}
          </button>
          <button data-testid="general-save"
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "0.45rem 1rem", borderRadius: "6px", border: "none",
              background: "var(--primary)", color: "var(--primary-foreground)",
              fontSize: "0.8rem", fontWeight: 600, cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? t("pages.orgSettings.saving") : saved ? t("pages.orgSettings.saved") : t("pages.orgSettings.save")}
          </button>
        </div>
      </div>

      {/* Sites in this org */}
      <div style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>{t("pages.orgSettings.sites")}</h2>
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          {activeOrg.sites.length === 1 ? t("pages.orgSettings.siteCountOne", { count: activeOrg.sites.length }) : t("pages.orgSettings.siteCountOther", { count: activeOrg.sites.length })}
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
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--destructive)" }}>{t("pages.orgSettings.dangerZone")}</h2>
        <div style={{
          background: "var(--card)", border: "1px solid color-mix(in srgb, var(--destructive) 30%, var(--border))",
          borderRadius: "10px", padding: "1.25rem",
        }}>
          <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
            {t("pages.orgSettings.deleteWarnTitle")}
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
            {t("pages.orgSettings.deleteWarnBody")}
          </p>
          <button data-testid="general-delete-org"
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            style={{
              padding: "0.4rem 0.75rem", borderRadius: "6px", border: "none",
              background: "var(--destructive)", color: "#fff",
              fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
            }}
          >
            {t("pages.orgSettings.deleteOrg")}
          </button>
        </div>
      </div>

      </>}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div data-testid="delete-org-dialog"
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowDeleteDialog(false); setDeleteConfirm(""); } }}
        >
          <div style={{
            background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "12px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)", width: "min(440px, 90vw)", padding: "1.5rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>{t("pages.orgSettings.deleteOrg")}</h3>
              <button data-testid="delete-org-close" type="button" onClick={() => { setShowDeleteDialog(false); setDeleteConfirm(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.25rem" }}>×</button>
            </div>

            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
              {renderMarked(t("pages.orgSettings.deleteDialogBody", { name: activeOrg.name }), { color: "var(--foreground)" }, {})}
            </p>

            <p style={{ fontSize: "0.8rem", marginBottom: "0.5rem", marginTop: "1rem" }}>
              {renderMarked(t("pages.orgSettings.typeToConfirm", { code: deleteCode }), undefined, { background: "var(--muted)", padding: "0.15rem 0.4rem", borderRadius: "4px", fontSize: "0.75rem", fontFamily: "monospace" })}
            </p>
            <input data-testid="delete-org-confirm-input"
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={t("pages.orgSettings.confirmPlaceholder")}
              autoFocus
              style={{
                width: "100%", padding: "0.5rem 0.6rem", borderRadius: "6px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
                marginBottom: "1rem",
              }}
            />
            <button data-testid="delete-org-confirm"
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
              {deleting ? t("pages.orgSettings.deleting") : t("pages.orgSettings.confirmDelete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
