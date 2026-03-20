"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/app/api/search/route";
import {
  Search, FileText, Globe, X, LayoutDashboard, Image, Bot, Calendar,
  ListChecks, Terminal, Settings2, Sparkles, UserCircle, LogOut, Lock,
  Database, Link2, BarChart3, Trash2, Plus, Zap, Puzzle, ArrowRightLeft,
  Building2, HelpCircle, HardDrive, Play, ExternalLink, Moon, Sun, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Quick actions (Spotlight-style) ────────────────────────── */

interface QuickAction {
  id: string;
  label: string;
  sublabel: string;
  category: "navigation" | "action" | "settings" | "account";
  icon: React.ReactNode;
  href?: string;
  action?: () => void;
  keywords: string[]; // extra terms for fuzzy matching
  featured?: boolean; // show in default view (no query)
  newTab?: boolean; // open in new browser tab
}

const ICON_SIZE = { width: "0.9rem", height: "0.9rem" };
const MUTED = "var(--muted-foreground)";

function buildQuickActions(logout: () => void): QuickAction[] {
  return [
    // Navigation
    { id: "nav-dashboard", label: "Dashboard", sublabel: "Overview", category: "navigation", icon: <LayoutDashboard style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin", keywords: ["home", "oversigt"], featured: true },
    { id: "nav-sites", label: "Sites", sublabel: "Manage sites", category: "navigation", icon: <Globe style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/sites", keywords: ["site", "sider"] },
    { id: "nav-agents", label: "AI Agents", sublabel: "Automated content generation", category: "navigation", icon: <Bot style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/agents", keywords: ["agent", "ai", "bot", "automation"], featured: true },
    { id: "nav-media", label: "Media", sublabel: "Images and files", category: "navigation", icon: <Image style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/media", keywords: ["billeder", "images", "files", "upload"], featured: true },
    { id: "nav-ints", label: "Interactives", sublabel: "HTML interactives", category: "navigation", icon: <Puzzle style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/interactives", keywords: ["ints", "interactive", "html"] },
    { id: "nav-calendar", label: "Calendar", sublabel: "Scheduled content", category: "navigation", icon: <Calendar style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/scheduled", keywords: ["kalender", "schedule", "planned"], featured: true },
    { id: "nav-curation", label: "Curation Queue", sublabel: "Review AI-generated content", category: "navigation", icon: <ListChecks style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/curation", keywords: ["queue", "review", "approve"] },
    { id: "nav-cockpit", label: "AI Cockpit", sublabel: "Chat with AI", category: "navigation", icon: <Terminal style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/command", keywords: ["chat", "cockpit", "command", "ai"], featured: true },
    { id: "nav-performance", label: "Performance", sublabel: "Site analytics", category: "navigation", icon: <BarChart3 style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/performance", keywords: ["analytics", "stats", "speed"] },
    { id: "nav-linkchecker", label: "Link Checker", sublabel: "Find broken links", category: "navigation", icon: <Link2 style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/link-checker", keywords: ["links", "broken", "check"] },
    { id: "nav-backup", label: "Backup", sublabel: "Backup & restore content", category: "navigation", icon: <Database style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/backup", keywords: ["backup", "restore", "export", "sikkerhedskopi"] },
    { id: "nav-trash", label: "Trash", sublabel: "Deleted items", category: "navigation", icon: <Trash2 style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/trash", keywords: ["slettet", "deleted", "papirkurv"] },

    // Actions — create
    { id: "act-new-agent", label: "New Agent", sublabel: "Create a new AI agent", category: "action", icon: <Plus style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/agents/new", keywords: ["new", "agent", "create", "ny", "opret"], featured: true },
    { id: "act-new-site", label: "New site", sublabel: "Create a new site", category: "action", icon: <Plus style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/sites/new", keywords: ["new", "site", "create", "ny", "opret"] },
    { id: "act-new-org", label: "New organization", sublabel: "Create a new organization", category: "action", icon: <Plus style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/organizations/new", keywords: ["new", "org", "organization", "create", "ny", "opret"] },

    // Actions — run
    { id: "act-backup", label: "Create Backup", sublabel: "Backup all content now", category: "action", icon: <HardDrive style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["backup", "sikkerhedskopi", "export"], action: () => { fetch("/api/admin/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trigger: "manual" }) }).then(() => { window.location.href = "/admin/backup"; }); } },
    { id: "act-linkcheck", label: "Run Link Check", sublabel: "Scan all content for broken links", category: "action", icon: <Play style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/link-checker", keywords: ["link", "check", "scan", "broken", "links"] },
    { id: "act-preview", label: "Preview site", sublabel: "Open site preview", category: "action", icon: <ExternalLink style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["preview", "site", "view", "se", "forhåndsvisning"], action: () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true })); } },
    { id: "act-refresh", label: "Refresh data", sublabel: "Reload current page data", category: "action", icon: <RefreshCw style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["refresh", "reload", "genindlæs"], action: () => { window.location.reload(); } },

    // Actions — misc
    { id: "act-view-landing", label: "View landing page", sublabel: "Open in new tab", category: "action", icon: <Globe style={{ ...ICON_SIZE, color: MUTED }} />, href: "/home", keywords: ["landing", "homepage", "forside", "public", "view"], newTab: true },
    { id: "act-help", label: "Help & Support", sublabel: "Docs, shortcuts, community", category: "action", icon: <HelpCircle style={{ ...ICON_SIZE, color: MUTED }} />, keywords: ["help", "hjælp", "support", "docs", "shortcuts"], action: () => { window.dispatchEvent(new CustomEvent("cms:open-help")); }, featured: true },

    // Settings
    { id: "set-general", label: "Site Settings", sublabel: "General site configuration", category: "settings", icon: <Settings2 style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings", keywords: ["settings", "indstillinger", "config"], featured: true },
    { id: "set-team", label: "Team", sublabel: "Manage team members", category: "settings", icon: <UserCircle style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=team", keywords: ["team", "invite", "members", "brugere"] },
    { id: "set-email", label: "Email Settings", sublabel: "Configure email delivery", category: "settings", icon: <Zap style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=email", keywords: ["email", "resend", "smtp"] },
    { id: "set-ai", label: "AI Settings", sublabel: "API keys and providers", category: "settings", icon: <Sparkles style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=ai", keywords: ["ai", "api", "keys", "anthropic", "openai"] },
    { id: "set-deploy", label: "Deploy", sublabel: "Deploy hooks and triggers", category: "settings", icon: <ArrowRightLeft style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=deploy", keywords: ["deploy", "vercel", "netlify", "fly", "cloudflare", "publish", "ship"] },
    { id: "set-automation", label: "Automation", sublabel: "Backup, link checker, webhooks", category: "settings", icon: <Zap style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=tools", keywords: ["automation", "backup", "webhook", "schedule", "link checker", "notification"] },
    { id: "set-brand", label: "Brand Voice", sublabel: "Tone and writing style", category: "settings", icon: <Sparkles style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=brand-voice", keywords: ["brand", "voice", "tone", "stil", "stemme"] },
    { id: "set-mcp", label: "MCP Settings", sublabel: "Model Context Protocol", category: "settings", icon: <Database style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=mcp", keywords: ["mcp", "protocol", "claude", "cursor"] },
    { id: "set-prompts", label: "AI Prompts", sublabel: "Customize AI prompts", category: "settings", icon: <Sparkles style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/settings?tab=prompts", keywords: ["prompts", "ai", "custom", "skabelon"] },

    // Account
    { id: "acc-prefs", label: "Account Preferences", sublabel: "Profile and preferences", category: "account", icon: <UserCircle style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/account", keywords: ["account", "profil", "preferences", "konto"], featured: true },
    { id: "acc-security", label: "Security", sublabel: "Password and authentication", category: "account", icon: <Lock style={{ ...ICON_SIZE, color: MUTED }} />, href: "/admin/account?tab=security", keywords: ["password", "security", "2fa", "adgangskode"] },
    { id: "acc-logout", label: "Log out", sublabel: "Sign out of your account", category: "account", icon: <LogOut style={{ ...ICON_SIZE, color: "rgb(239 68 68)" }} />, action: logout, keywords: ["logout", "sign out", "log ud", "afslut"], featured: true },
  ];
}

const CATEGORY_LABELS: Record<string, string> = {
  content: "Content",
  navigation: "Navigation",
  action: "Actions",
  settings: "Settings",
  account: "Account",
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
  const [query, setQuery] = useState("");
  const [contentResults, setContentResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    fetch("/api/auth/logout", { method: "POST" }).then(() => {
      router.push("/admin/login");
      onClose();
    });
  }, [router, onClose]);

  const [collections, setCollections] = useState<{ name: string; label: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string; orgId: string }[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string; firstSiteId: string | null }[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string>("");
  const [activeOrgId, setActiveOrgId] = useState<string>("");

  const quickActions = useMemo(() => {
    const actions = buildQuickActions(logout);
    // Add dynamic collection navigation
    for (const col of collections) {
      actions.push({
        id: `col-${col.name}`,
        label: col.label,
        sublabel: `Collection · ${col.name}`,
        category: "navigation",
        icon: <Database style={{ ...ICON_SIZE, color: MUTED }} />,
        href: `/admin/${col.name}`,
        keywords: [col.name, col.label.toLowerCase()],
      });
    }
    // Add dynamic site switching
    for (const site of sites) {
      if (site.id === activeSiteId) continue; // skip current site
      actions.push({
        id: `site-${site.id}`,
        label: site.name,
        sublabel: "Switch to site",
        category: "action",
        icon: <Globe style={{ ...ICON_SIZE, color: MUTED }} />,
        keywords: [site.name.toLowerCase(), "site", "switch", "skift"],
        action: () => {
          document.cookie = `cms-active-site=${encodeURIComponent(site.id)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
          fetch("/api/admin/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lastActiveOrg: site.orgId, lastActiveSite: site.id }),
          }).catch(() => {});
          window.dispatchEvent(new CustomEvent("cms-site-change", { detail: { siteId: site.id } }));
          window.dispatchEvent(new CustomEvent("cms-registry-change"));
          router.push("/admin");
          router.refresh();
        },
      });
    }
    // Add dynamic org switching
    for (const org of orgs) {
      if (org.id === activeOrgId) continue;
      actions.push({
        id: `org-${org.id}`,
        label: org.name,
        sublabel: "Switch to organization",
        category: "action",
        icon: <Building2 style={{ ...ICON_SIZE, color: MUTED }} />,
        keywords: [org.name.toLowerCase(), "org", "organization", "organisation", "switch", "skift"],
        action: () => {
          document.cookie = `cms-active-org=${encodeURIComponent(org.id)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
          if (org.firstSiteId) {
            document.cookie = `cms-active-site=${encodeURIComponent(org.firstSiteId)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
            window.dispatchEvent(new CustomEvent("cms-site-change", { detail: { siteId: org.firstSiteId } }));
          } else {
            document.cookie = "cms-active-site=;path=/;max-age=0";
          }
          window.dispatchEvent(new CustomEvent("cms-registry-change"));
          router.push("/admin");
          router.refresh();
        },
      });
    }
    return actions;
  }, [logout, collections, sites, activeSiteId, orgs, activeOrgId, router]);

  /* Auto-focus input + fetch collections + sites */
  useEffect(() => {
    inputRef.current?.focus();
    fetch("/api/cms/collections")
      .then((r) => r.ok ? r.json() : { collections: [] })
      .then((d: { collections: { name: string; label: string }[] }) => setCollections(d.collections ?? []))
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
        const allOrgs: { id: string; name: string; firstSiteId: string | null }[] = [];
        for (const org of d.registry.orgs ?? []) {
          allOrgs.push({ id: org.id, name: org.name, firstSiteId: org.sites?.[0]?.id ?? null });
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

  /* Build unified results: quick actions (filtered) + content results */
  const items: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result: PaletteItem[] = [];

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
      result.push({
        id: `content-${r.collection}-${r.slug}`,
        label: r.title,
        sublabel: `${r.collectionLabel} · ${r.slug}`,
        category: "content",
        icon: r.status === "published"
          ? <Globe style={{ ...ICON_SIZE, color: "#4ade80" }} />
          : r.status === "expired"
          ? <FileText style={{ ...ICON_SIZE, color: "rgb(239 68 68)" }} />
          : <FileText style={{ ...ICON_SIZE, color: MUTED }} />,
        href: `/admin/${r.collection}/${r.slug}`,
      });
    }

    return result;
  }, [query, quickActions, contentResults]);

  /* Reset selection when results change */
  useEffect(() => { setSelected(0); }, [items.length]);

  /* Navigate to item */
  const navigateItem = useCallback((item: PaletteItem) => {
    onClose();
    if (item.action) { setTimeout(() => item.action!(), 50); return; }
    if (item.href) {
      if (item.newTab) { window.open(item.href, "_blank"); }
      else { router.push(item.href); }
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
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search content, navigate, or run actions…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: "1rem", color: "var(--foreground)",
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.125rem" }}>
              <X style={{ width: "0.875rem", height: "0.875rem" }} />
            </button>
          )}
          <kbd style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border)", color: "var(--muted-foreground)", fontFamily: "monospace", flexShrink: 0 }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ padding: "1.25rem 1rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Searching…</div>
          )}
          {!loading && query && items.length === 0 && (
            <div style={{ padding: "1.25rem 1rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
              No results for <strong style={{ color: "var(--foreground)" }}>"{query}"</strong>
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
                {CATEGORY_LABELS[group.category] ?? group.category}
              </div>

              {group.items.map((item, localIdx) => {
                const globalIdx = group.startIdx + localIdx;
                return (
                  <button
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
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>ESC close</span>
          <span style={{ marginLeft: "auto" }}>⌘K toggle</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Highlight matching characters ─────────────────────────── */
function Highlight({ text, query }: { text: string; query: string }) {
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
