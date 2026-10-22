"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/app/api/search/route";
import { sanitizeFavorites } from "@/lib/favorites";
import {
  Search, FileText, Globe, X, LayoutDashboard, Image, Bot, Calendar,
  ListChecks, Terminal, Settings2, Sparkles, UserCircle, LogOut, Lock,
  Database, Link2, BarChart3, Trash2, Plus, Zap, Puzzle, ArrowRightLeft,
  Building2, HelpCircle, HardDrive, Play, ExternalLink, Moon, Sun, RefreshCw, Heart,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { switchSite, switchOrg } from "@/lib/switch-context";
import { usePermissions } from "@/hooks/use-permissions";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useT } from "@/lib/i18n-context";

/* ─── Quick actions (Spotlight-style) ────────────────────────── */

interface QuickAction {
  id: string;
  label: string;
  sublabel: string;
  category: "favorites" | "navigation" | "action" | "settings" | "account";
  icon: React.ReactNode;
  href?: string;
  action?: () => void;
  keywords: string[]; // extra terms for fuzzy matching
  featured?: boolean; // show in default view (no query)
  newTab?: boolean; // open in new browser tab
  /** If set, only show this item when the user has this permission. */
  permission?: string;
  /** F153: if set, only show this item when the tenant has this capability. */
  capability?: string;
}

const ICON_SIZE = { width: "0.9rem", height: "0.9rem" };
const MUTED = "var(--muted-foreground)";

function buildQuickActions(logout: () => void, t: (key: string, vars?: Record<string, string | number>) => string): QuickAction[] {
  return [
    // Navigation
    { id: "nav-dashboard", label: t("shell.commandPalette.items.navDashboard.label"), sublabel: t("shell.commandPalette.items.navDashboard.sublabel"), category: "navigation", icon: <LayoutDashboard style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin", keywords: ["home", "oversigt"], featured: true },
    { id: "nav-sites", label: t("shell.commandPalette.items.navSites.label"), sublabel: t("shell.commandPalette.items.navSites.sublabel"), category: "navigation", icon: <Globe style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/sites", keywords: ["site", "sider"] },
    { id: "nav-agents", capability: "agents", label: t("shell.commandPalette.items.navAgents.label"), sublabel: t("shell.commandPalette.items.navAgents.sublabel"), category: "navigation", icon: <Bot style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/agents", keywords: ["agent", "ai", "bot", "automation"], featured: true },
    // Phase 6 — Templates and Workflows are tabs on /admin/agents but
    // it's nice to deep-link to them from the palette so curators can
    // jump straight in. The localStorage key cms:agents-tab is read by
    // AgentsTabs on mount, so we set it before navigating.
    { id: "nav-agent-templates", capability: "agents", label: t("shell.commandPalette.items.navAgentTemplates.label"), sublabel: t("shell.commandPalette.items.navAgentTemplates.sublabel"), category: "navigation", icon: <Bot style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["template", "templates", "marketplace", "preset", "agent"], action: () => { try { localStorage.setItem("cms:agents-tab", "templates"); } catch {} window.location.href = "/admin/agents"; } },
    { id: "nav-workflows", capability: "agents", label: t("shell.commandPalette.items.navWorkflows.label"), sublabel: t("shell.commandPalette.items.navWorkflows.sublabel"), category: "navigation", icon: <Bot style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["workflow", "workflows", "pipeline", "chain", "agent"], action: () => { try { localStorage.setItem("cms:agents-tab", "workflows"); } catch {} window.location.href = "/admin/agents"; } },
    { id: "nav-media", label: t("shell.commandPalette.items.navMedia.label"), sublabel: t("shell.commandPalette.items.navMedia.sublabel"), category: "navigation", icon: <Image style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/media", keywords: ["billeder", "images", "files", "upload"], featured: true },
    { id: "nav-ints", capability: "interactives", label: t("shell.commandPalette.items.navInts.label"), sublabel: t("shell.commandPalette.items.navInts.sublabel"), category: "navigation", icon: <Puzzle style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/interactives", keywords: ["ints", "interactive", "html"] },
    { id: "nav-calendar", capability: "scheduling", label: t("shell.commandPalette.items.navCalendar.label"), sublabel: t("shell.commandPalette.items.navCalendar.sublabel"), category: "navigation", icon: <Calendar style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/scheduled", keywords: ["kalender", "schedule", "planned"], featured: true },
    { id: "nav-curation", capability: "ai", label: t("shell.commandPalette.items.navCuration.label"), sublabel: t("shell.commandPalette.items.navCuration.sublabel"), category: "navigation", icon: <ListChecks style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/curation", keywords: ["queue", "review", "approve"] },
    { id: "nav-chat", capability: "chat", label: t("shell.commandPalette.items.navChat.label"), sublabel: t("shell.commandPalette.items.navChat.sublabel"), category: "navigation", icon: <Terminal style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["chat", "ai", "spørg"], featured: true, action: () => { window.dispatchEvent(new CustomEvent("cms:set-admin-mode", { detail: "chat" })); } },
    { id: "nav-seo", capability: "seo", label: t("shell.commandPalette.items.navSeo.label"), sublabel: t("shell.commandPalette.items.navSeo.sublabel"), category: "navigation", icon: <Search style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/seo", keywords: ["seo", "meta", "keywords", "optimize", "søgemaskine"], featured: true },
    { id: "nav-visibility", capability: "seo", label: t("shell.commandPalette.items.navVisibility.label"), sublabel: t("shell.commandPalette.items.navVisibility.sublabel"), category: "navigation", icon: <BarChart3 style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/visibility", keywords: ["visibility", "synlighed", "geo", "ai", "score", "ranking"] },
    { id: "nav-analytics", capability: "quality", label: t("shell.commandPalette.items.navAnalytics.label"), sublabel: t("shell.commandPalette.items.navAnalytics.sublabel"), category: "navigation", icon: <BarChart3 style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/performance", keywords: ["analytics", "performance", "stats", "statistik", "ai analytics"] },
    { id: "nav-linkchecker", capability: "quality", label: t("shell.commandPalette.items.navLinkchecker.label"), sublabel: t("shell.commandPalette.items.navLinkchecker.sublabel"), category: "navigation", icon: <Link2 style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/link-checker", keywords: ["links", "broken", "check"] },
    { id: "nav-log", label: t("shell.commandPalette.items.navLog.label"), sublabel: t("shell.commandPalette.items.navLog.sublabel"), category: "navigation", icon: <ScrollText style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/log", keywords: ["log", "audit", "events", "trail", "history", "errors", "gdpr", "logs"], permission: "logs.view" },
    { id: "nav-backup", capability: "backup", label: t("shell.commandPalette.items.navBackup.label"), sublabel: t("shell.commandPalette.items.navBackup.sublabel"), category: "navigation", icon: <Database style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/backup", keywords: ["backup", "restore", "export", "sikkerhedskopi"] },
    { id: "nav-trash", label: t("shell.commandPalette.items.navTrash.label"), sublabel: t("shell.commandPalette.items.navTrash.sublabel"), category: "navigation", icon: <Trash2 style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/trash", keywords: ["slettet", "deleted", "papirkurv"] },

    // Actions — create
    { id: "act-new-agent", capability: "agents", label: t("shell.commandPalette.items.actNewAgent.label"), sublabel: t("shell.commandPalette.items.actNewAgent.sublabel"), category: "action", icon: <Plus style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/agents/new", keywords: ["new", "agent", "create", "ny", "opret"], featured: true, permission: "agents.manage" },
    { id: "act-new-workflow", capability: "agents", label: t("shell.commandPalette.items.actNewWorkflow.label"), sublabel: t("shell.commandPalette.items.actNewWorkflow.sublabel"), category: "action", icon: <Plus style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["new", "workflow", "pipeline", "chain", "create", "ny", "opret"], action: () => { try { localStorage.setItem("cms:agents-tab", "workflows"); localStorage.setItem("cms:agents-workflows-create", "1"); } catch {} window.location.href = "/admin/agents"; }, permission: "agents.manage" },
    { id: "act-new-site", label: t("shell.commandPalette.items.actNewSite.label"), sublabel: t("shell.commandPalette.items.actNewSite.sublabel"), category: "action", icon: <Plus style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/sites/new", keywords: ["new", "site", "create", "ny", "opret"], permission: "settings.edit" },
    { id: "act-new-org", label: t("shell.commandPalette.items.actNewOrg.label"), sublabel: t("shell.commandPalette.items.actNewOrg.sublabel"), category: "action", icon: <Plus style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/organizations/new", keywords: ["new", "org", "organization", "create", "ny", "opret"], permission: "settings.edit" },

    // Actions — run
    { id: "act-backup", capability: "backup", label: t("shell.commandPalette.items.actBackup.label"), sublabel: t("shell.commandPalette.items.actBackup.sublabel"), category: "action", icon: <HardDrive style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["backup", "sikkerhedskopi", "export"], action: () => { fetch("/api/admin/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trigger: "manual" }) }).then(() => { window.location.href = "/admin/backup"; }); }, permission: "backup.manage" },
    { id: "act-linkcheck", label: t("shell.commandPalette.items.actLinkcheck.label"), sublabel: t("shell.commandPalette.items.actLinkcheck.sublabel"), category: "action", icon: <Play style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/link-checker", keywords: ["link", "check", "scan", "broken", "links"] },
    { id: "act-preview", label: t("shell.commandPalette.items.actPreview.label"), sublabel: t("shell.commandPalette.items.actPreview.sublabel"), category: "action", icon: <ExternalLink style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["preview", "site", "view", "se", "forhåndsvisning"], action: () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true })); } },
    { id: "act-refresh", label: t("shell.commandPalette.items.actRefresh.label"), sublabel: t("shell.commandPalette.items.actRefresh.sublabel"), category: "action", icon: <RefreshCw style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["refresh", "reload", "genindlæs"], action: () => { window.location.reload(); } },

    // Actions — misc
    { id: "act-view-landing", label: t("shell.commandPalette.items.actViewLanding.label"), sublabel: t("shell.commandPalette.items.actViewLanding.sublabel"), category: "action", icon: <Globe style={{ ...ICON_SIZE, color: MUTED }} />, href: "/home", keywords: ["landing", "homepage", "forside", "public", "view"], newTab: true },
    { id: "act-help", label: t("shell.commandPalette.items.actHelp.label"), sublabel: t("shell.commandPalette.items.actHelp.sublabel"), category: "action", icon: <HelpCircle style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["help", "hjælp", "support", "docs", "shortcuts"], action: () => { window.dispatchEvent(new CustomEvent("cms:open-help")); }, featured: true },

    // Settings
    { id: "set-general", label: t("shell.commandPalette.items.setGeneral.label"), sublabel: t("shell.commandPalette.items.setGeneral.sublabel"), category: "settings", icon: <Settings2 style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings", keywords: ["settings", "indstillinger", "config"], featured: true, permission: "settings.edit" },
    { id: "set-team", label: t("shell.commandPalette.items.setTeam.label"), sublabel: t("shell.commandPalette.items.setTeam.sublabel"), category: "settings", icon: <UserCircle style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=team", keywords: ["team", "invite", "members", "brugere"], permission: "users.manage" },
    { id: "set-email", label: t("shell.commandPalette.items.setEmail.label"), sublabel: t("shell.commandPalette.items.setEmail.sublabel"), category: "settings", icon: <Zap style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=email", keywords: ["email", "resend", "smtp"], permission: "settings.edit" },
    { id: "set-ai", label: t("shell.commandPalette.items.setAi.label"), sublabel: t("shell.commandPalette.items.setAi.sublabel"), category: "settings", icon: <Sparkles style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=ai", keywords: ["ai", "api", "keys", "anthropic", "openai"], permission: "settings.edit" },
    { id: "set-deploy", label: t("shell.commandPalette.items.setDeploy.label"), sublabel: t("shell.commandPalette.items.setDeploy.sublabel"), category: "settings", icon: <ArrowRightLeft style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=deploy", keywords: ["deploy", "vercel", "netlify", "fly", "cloudflare", "publish", "ship", "github"], permission: "settings.edit" },
    // Hash anchors directly to the Custom Domain section so users searching
    // for "domain" / "dns" don't have to scroll past Provider + Build to find it.
    { id: "set-custom-domain", label: t("shell.commandPalette.items.setCustomDomain.label"), sublabel: t("shell.commandPalette.items.setCustomDomain.sublabel"), category: "settings", icon: <Globe style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=deploy#custom-domain", keywords: ["domain", "custom", "dns", "cname", "cloudflare", "registrar", "buy", "register", "url"], permission: "settings.edit" },
    { id: "set-automation", label: t("shell.commandPalette.items.setAutomation.label"), sublabel: t("shell.commandPalette.items.setAutomation.sublabel"), category: "settings", icon: <Zap style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=tools", keywords: ["automation", "backup", "webhook", "schedule", "link checker", "notification"], permission: "settings.edit" },
    { id: "set-brand", label: t("shell.commandPalette.items.setBrand.label"), sublabel: t("shell.commandPalette.items.setBrand.sublabel"), category: "settings", icon: <Sparkles style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=brand-voice", keywords: ["brand", "voice", "tone", "stil", "stemme"] },
    { id: "set-mcp", label: t("shell.commandPalette.items.setMcp.label"), sublabel: t("shell.commandPalette.items.setMcp.sublabel"), category: "settings", icon: <Database style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=mcp", keywords: ["mcp", "protocol", "claude", "cursor"] },
    { id: "set-prompts", label: t("shell.commandPalette.items.setPrompts.label"), sublabel: t("shell.commandPalette.items.setPrompts.sublabel"), category: "settings", icon: <Sparkles style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=prompts", keywords: ["prompts", "ai", "custom", "skabelon"] },

    // Account
    { id: "acc-prefs", label: t("shell.commandPalette.items.accPrefs.label"), sublabel: t("shell.commandPalette.items.accPrefs.sublabel"), category: "account", icon: <UserCircle style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/account", keywords: ["account", "profil", "preferences", "konto"], featured: true },
    { id: "acc-security", label: t("shell.commandPalette.items.accSecurity.label"), sublabel: t("shell.commandPalette.items.accSecurity.sublabel"), category: "account", icon: <Lock style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/account?tab=security", keywords: ["password", "security", "2fa", "adgangskode"] },
    { id: "acc-logout", label: t("shell.commandPalette.items.accLogout.label"), sublabel: t("shell.commandPalette.items.accLogout.sublabel"), category: "account", icon: <LogOut style={{ ...ICON_SIZE, color: "rgb(239 68 68)" }} />, action: logout, keywords: ["logout", "sign out", "log ud", "afslut"], featured: true },
  ];
}

const CATEGORY_LABELS: Record<string, string> = {
  favorites: "shell.commandPalette.categories.favorites",
  content: "shell.commandPalette.categories.content",
  navigation: "shell.commandPalette.categories.navigation",
  action: "shell.commandPalette.categories.action",
  settings: "shell.commandPalette.categories.settings",
  account: "shell.commandPalette.categories.account",
};

/* ─── Unified result type ────────────────────────────────────── */

interface PaletteItem {
  id: string;
  label: string;
  sublabel: string;
  category: string;
  icon: React.ReactNode;
  href?: string;
  action?: () => void;
  newTab?: boolean;
}

/* ─── Provider: mounts the palette and registers ⌘K ─────────── */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {children}
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </>
  );
}

/* ─── Palette ────────────────────────────────────────────────── */
function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [contentResults, setContentResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const can = usePermissions();
  const canUse = useCapabilities();

  const logout = useCallback(() => {
    fetch("/api/auth/logout", { method: "POST" })
      .then((r) => r.json().catch(() => ({})) as Promise<{ redirect?: string }>)
      .then(({ redirect }) => {
        onClose();
        // A full navigation, not router.push: the target may be BID's end-session.
        window.location.href = redirect ?? "/admin/login";
      });
  }, [router, onClose]);

  const [collections, setCollections] = useState<{ name: string; label: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string; orgId: string }[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string; firstSiteId: string | null; siteCount: number }[]>([]);
  // Phase 6 — workflows + agent templates surfaced as searchable palette items
  const [workflows, setWorkflows] = useState<{ id: string; name: string; stepCount: number }[]>([]);
  const [agentTemplates, setAgentTemplates] = useState<{ id: string; name: string; description: string; source: "local" | "marketplace" }[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string>("");
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [favorites, setFavorites] = useState<Array<{ id: string; type: string; label: string; path: string }>>([]);

  // Load favorites from localStorage on mount + listen for changes
  useEffect(() => {
    try {
      const cached = localStorage.getItem("cms-favorites");
      if (cached) setFavorites(sanitizeFavorites(JSON.parse(cached)));
    } catch { /* ignore */ }
    function onChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (Array.isArray(detail)) setFavorites(sanitizeFavorites(detail));
    }
    window.addEventListener("cms:favorites-changed", onChange);
    return () => window.removeEventListener("cms:favorites-changed", onChange);
  }, []);

  const quickActions = useMemo(() => {
    const actions = buildQuickActions(logout, t)
      .filter((a) => !a.permission || can(a.permission))
      .filter((a) => !a.capability || canUse(a.capability));
    // Add dynamic collection navigation
    for (const col of collections) {
      actions.push({
        id: `col-${col.name}`,
        label: col.label,
        sublabel: t("shell.commandPalette.collectionSub", { name: col.name }),
        category: "navigation",
        icon: <Database style={{ ...ICON_SIZE, color: MUTED }} />,
        href: `/admin/content/${col.name}`,
        keywords: [col.name, col.label.toLowerCase()],
      });
    }
    // Add dynamic site switching
    for (const site of sites) {
      if (site.id === activeSiteId) continue; // skip current site
      actions.push({
        id: `site-${site.id}`,
        label: site.name,
        sublabel: t("shell.commandPalette.switchToSite"),
        category: "action",
        icon: <Globe style={{ ...ICON_SIZE, color: MUTED }} />,
        keywords: [site.name.toLowerCase(), "site", "switch", "skift"],
        action: () => {
          switchSite(site.id, site.orgId);
        },
      });
    }
    // Add dynamic org switching
    for (const org of orgs) {
      if (org.id === activeOrgId) continue;
      actions.push({
        id: `org-${org.id}`,
        label: org.name,
        sublabel: t("shell.commandPalette.switchToOrg"),
        category: "action",
        icon: <Building2 style={{ ...ICON_SIZE, color: MUTED }} />,
        keywords: [org.name.toLowerCase(), "org", "organization", "organisation", "switch", "skift"],
        action: () => {
          switchOrg(org.id, org.firstSiteId ?? null, org.siteCount ?? 0);
        },
      });
    }
    // Phase 6 — dynamic per-workflow entries. Curators can search by
    // workflow name and land on the Workflows tab pre-filtered.
    for (const wf of workflows) {
      actions.push({
        id: `wf-${wf.id}`,
        label: wf.name,
        sublabel: t(wf.stepCount === 1 ? "shell.commandPalette.workflowStepsOne" : "shell.commandPalette.workflowStepsOther", { count: wf.stepCount }),
        category: "navigation",
        icon: <Bot style={{ ...ICON_SIZE, color: MUTED }} />,
        keywords: [wf.name.toLowerCase(), "workflow", "pipeline", "chain"],
        action: () => {
          try { localStorage.setItem("cms:agents-tab", "workflows"); } catch {}
          window.location.href = "/admin/agents";
        },
      });
    }
    // Phase 6 — dynamic per-template entries. Click → new-agent page
    // pre-filtered with the template selected (the new-agent page reads
    // ?template=<id> from the query string already).
    for (const tpl of agentTemplates) {
      actions.push({
        id: `tpl-${tpl.id}`,
        label: tpl.name,
        sublabel: t(tpl.source === "local" ? "shell.commandPalette.localTemplate" : "shell.commandPalette.marketplaceTemplate", { description: tpl.description.slice(0, 70) }),
        category: "action",
        icon: <Plus style={{ ...ICON_SIZE, color: MUTED }} />,
        href: `/admin/agents/new?template=${encodeURIComponent(tpl.id)}`,
        keywords: [tpl.name.toLowerCase(), "template", tpl.source, "agent", "new"],
      });
    }
    return actions;
  }, [logout, can, collections, sites, activeSiteId, orgs, activeOrgId, workflows, agentTemplates, router, t]);

  /* Auto-focus input + fetch collections + sites */
  useEffect(() => {
    inputRef.current?.focus();
    fetch("/api/cms/collections")
      .then((r) => r.ok ? r.json() : { collections: [] })
      .then((d: { collections: { name: string; label: string }[] }) => setCollections(d.collections ?? []))
      .catch(() => {});
    // Phase 6 — workflows + agent templates for the palette dynamic items
    fetch("/api/cms/workflows")
      .then((r) => r.ok ? r.json() : [])
      .then((d: { id: string; name: string; steps: unknown[] }[]) => {
        if (!Array.isArray(d)) return;
        setWorkflows(d.map((w) => ({ id: w.id, name: w.name, stepCount: w.steps?.length ?? 0 })));
      })
      .catch(() => {});
    fetch("/api/cms/agent-templates")
      .then((r) => r.ok ? r.json() : null)
      .then((d: { local?: { id: string; name: string; description?: string }[]; marketplace?: { id: string; name: string; description?: string }[] } | null) => {
        if (!d) return;
        const tpls: { id: string; name: string; description: string; source: "local" | "marketplace" }[] = [];
        for (const t of d.local ?? []) tpls.push({ id: t.id, name: t.name, description: t.description ?? "", source: "local" });
        for (const t of d.marketplace ?? []) tpls.push({ id: t.id, name: t.name, description: t.description ?? "", source: "marketplace" });
        setAgentTemplates(tpls);
      })
      .catch(() => {});
    fetch("/api/cms/registry")
      .then((r) => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d?.registry) return;
        const currentOrgId = document.cookie.match(/(?:^|; )cms-active-org=([^;]*)/)?.[1] ?? d.registry.defaultOrgId;
        const currentSiteId = document.cookie.match(/(?:^|; )cms-active-site=([^;]*)/)?.[1] ?? "";
        setActiveSiteId(currentSiteId);
        setActiveOrgId(currentOrgId);
        // Sites: only from the active org
        const activeOrg = (d.registry.orgs ?? []).find((o: any) => o.id === currentOrgId) ?? d.registry.orgs?.[0];
        const orgSites: { id: string; name: string; orgId: string }[] = [];
        if (activeOrg) {
          for (const site of activeOrg.sites ?? []) {
            orgSites.push({ id: site.id, name: site.name, orgId: activeOrg.id });
          }
        }
        setSites(orgSites);
        // Orgs: all orgs for switching
        const allOrgs: { id: string; name: string; firstSiteId: string | null; siteCount: number }[] = [];
        for (const org of d.registry.orgs ?? []) {
          allOrgs.push({ id: org.id, name: org.name, firstSiteId: org.sites?.[0]?.id ?? null, siteCount: org.sites?.length ?? 0 });
        }
        setOrgs(allOrgs);
      })
      .catch(() => {});
  }, []);

  /* Search content with debounce */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setContentResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setContentResults(Array.isArray(data) ? data : []);
      } catch { setContentResults([]); }
      finally { setLoading(false); }
    }, 180);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  /* Build unified results: favorites + quick actions (filtered) + content results */
  const items: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result: PaletteItem[] = [];

    // Favorites first (F94) — always shown, filtered by query
    const matchedFavorites = favorites.filter((f) => {
      if (!q) return true;
      return f.label.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    });
    for (const f of matchedFavorites) {
      result.push({
        id: `fav-${f.id}`,
        label: f.label,
        sublabel: f.path,
        category: "favorites",
        icon: <Heart style={{ ...ICON_SIZE, color: "#ef4444" }} fill="#ef4444" />,
        href: f.path,
      });
    }

    // No query → show featured actions only (curated default view)
    // With query → filter all actions by search term
    const matchedActions = q
      ? quickActions.filter((a) => {
          const haystack = `${a.label} ${a.sublabel} ${a.keywords.join(" ")}`.toLowerCase();
          return haystack.includes(q);
        })
      : quickActions.filter((a) => a.featured);

    // Group: actions first (switch site/org), then navigation, settings, account
    const grouped = ["action", "navigation", "settings", "account"];
    for (const cat of grouped) {
      const catItems = matchedActions.filter((a) => a.category === cat);
      result.push(...catItems);
    }

    // Add content results
    for (const r of contentResults) {
      if (r.status === "media" && r.mediaUrl) {
        // Media result — show thumbnail, navigate to media with search query
        result.push({
          id: `media-${r.slug}`,
          label: r.title || r.slug,
          sublabel: r.slug,
          category: "content",
          icon: <img src={r.mediaThumbnail ?? r.mediaUrl} alt="" style={{ width: "0.9rem", height: "0.9rem", objectFit: "cover", borderRadius: "2px" }} />,
          href: `/admin/media?q=${encodeURIComponent(query)}`,
        });
      } else {
        result.push({
          id: `content-${r.collection}-${r.slug}`,
          label: r.title || r.slug,
          sublabel: r.matchedIn === "body"
            ? t("shell.commandPalette.foundInBody", { collection: r.collectionLabel })
            : `${r.collectionLabel} · ${r.slug}`,
          category: "content",
          icon: r.status === "published"
            ? <Globe style={{ ...ICON_SIZE, color: "#4ade80" }} />
            : r.status === "expired"
            ? <FileText style={{ ...ICON_SIZE, color: "rgb(239 68 68)" }} />
            : <FileText style={{ ...ICON_SIZE, color: MUTED }} />,
          href: `/admin/content/${r.collection}/${r.slug}`,
        });
      }
    }

    return result;
  }, [query, quickActions, contentResults, favorites, t]);

  /* Reset selection when results change */
  useEffect(() => { setSelected(0); }, [items.length]);

  /* Navigate to item — also switches from chat to admin mode if needed */
  const navigateItem = useCallback((item: PaletteItem) => {
    if (item.action) { onClose(); setTimeout(() => item.action!(), 50); return; }
    if (item.href) {
      if (item.newTab) { window.open(item.href, "_blank"); onClose(); }
      else {
        window.dispatchEvent(new CustomEvent("cms:navigate-admin", { detail: { path: item.href } }));
        router.push(item.href);
        setTimeout(onClose, 50);
      }
    } else {
      onClose();
    }
  }, [router, onClose]);

  /* Keyboard navigation */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, items.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === "Enter" && items[selected]) {
      navigateItem(items[selected]);
    }
  }, [items, selected, navigateItem, onClose]);

  /* Scroll selected item into view */
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  /* Global ESC handler — works even when input doesn't have focus */
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  /* Close on backdrop click */
  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  /* Group items by category for section headers */
  const groupedItems: { category: string; startIdx: number; items: PaletteItem[] }[] = useMemo(() => {
    const groups: { category: string; startIdx: number; items: PaletteItem[] }[] = [];
    let currentCat = "";
    let globalIdx = 0;
    for (const item of items) {
      if (item.category !== currentCat) {
        currentCat = item.category;
        groups.push({ category: currentCat, startIdx: globalIdx, items: [] });
      }
      groups[groups.length - 1].items.push(item);
      globalIdx++;
    }
    return groups;
  }, [items]);

  return (
    <div
      data-testid="command-palette-backdrop"
      onClick={onBackdropClick}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        style={{
          width: "min(640px, 90vw)",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "60vh",
        }}
      >
        {/* Input row */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1rem", borderBottom: "1px solid var(--border)" }}>
          <Search style={{ width: "1.1rem", height: "1.1rem", color: "var(--muted-foreground)", flexShrink: 0 }} />
          <input
            data-testid="command-palette-search-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("shell.commandPalette.placeholder")}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: "1rem", color: "var(--foreground)",
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button data-testid="command-palette-clear-search" type="button" onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.125rem" }}>
              <X style={{ width: "0.875rem", height: "0.875rem" }} />
            </button>
          )}
          <button
            data-testid="command-palette-close"
            type="button"
            onClick={onClose}
            style={{ padding: "0.2rem", borderRadius: "4px", border: "none", color: "var(--muted-foreground)", flexShrink: 0, background: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
            className="hover:text-foreground transition-colors"
            title={t("shell.commandPalette.close")}
          >
            <X style={{ width: "0.875rem", height: "0.875rem" }} />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ padding: "1.25rem 1rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>{t("shell.commandPalette.searching")}</div>
          )}
          {!loading && query && items.length === 0 && (
            <div style={{ padding: "1.25rem 1rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
              {t("shell.commandPalette.noResults", { query: "\u0000" }).split("\u0000").map((part, i) => (
                <span key={i}>{i > 0 && <strong style={{ color: "var(--foreground)" }}>"{query}"</strong>}{part}</span>
              ))}
            </div>
          )}

          {groupedItems.map((group) => (
            <div key={group.category}>
              {/* Category header */}
              <div style={{
                padding: "0.5rem 1rem 0.25rem",
                fontSize: "0.6rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--muted-foreground)",
              }}>
                {CATEGORY_LABELS[group.category] ? t(CATEGORY_LABELS[group.category]) : group.category}
              </div>

              {group.items.map((item, localIdx) => {
                const globalIdx = group.startIdx + localIdx;
                return (
                  <button
                    data-testid={`command-palette-item-${item.id}`}
                    key={item.id}
                    type="button"
                    data-idx={globalIdx}
                    onClick={() => navigateItem(item)}
                    onMouseEnter={() => setSelected(globalIdx)}
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors",
                      globalIdx === selected ? "bg-accent" : "hover:bg-accent/50"
                    )}
                    style={{ border: "none", cursor: "pointer" }}
                  >
                    {item.icon}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: "0.875rem", color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {query ? <Highlight text={item.label} query={query} /> : item.label}
                      </span>
                      <span style={{ display: "block", fontSize: "0.65rem", fontFamily: "monospace", color: "var(--muted-foreground)", marginTop: "0.05rem" }}>
                        {item.sublabel}
                      </span>
                    </span>
                    <kbd style={{
                      fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "4px",
                      border: "1px solid var(--border)", color: "var(--muted-foreground)",
                      fontFamily: "monospace", flexShrink: 0,
                      opacity: globalIdx === selected ? 1 : 0,
                    }}>
                      ↵
                    </kbd>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid var(--border)", display: "flex", gap: "1rem", fontSize: "0.65rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
          <span>{t("shell.commandPalette.hintNavigate")}</span>
          <span>{t("shell.commandPalette.hintOpen")}</span>
          <span>{t("shell.commandPalette.hintClose")}</span>
          <span style={{ marginLeft: "auto" }}>{t("shell.commandPalette.hintToggle")}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Highlight matching characters ─────────────────────────── */
function Highlight({ text, query }: { text?: string; query: string }) {
  // A content result can lack a title (undefined) — guard before .toLowerCase()
  // or the whole palette (and app) crashes to the error boundary on the first
  // keystroke that returns such a result.
  if (!text) return <>{text ?? ""}</>;
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "var(--primary)", color: "var(--primary-foreground)", borderRadius: "2px", padding: "0 1px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
