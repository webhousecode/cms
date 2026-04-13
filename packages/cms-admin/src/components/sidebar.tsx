"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import { useHeaderData } from "@/lib/header-data-context";
import {
  LayoutDashboard,
  Cpu,
  Bot,
  Inbox,
  FolderOpen,
  Image,
  Search,
  Link2,
  Trash2,
  BarChart2,
  Settings2,
  Zap,
  Boxes,
  Calendar,
  ChevronDown,
  ChevronRight,
  Wrench,
  HardDrive,
  Eye,
  Heart,
  Gauge,
  ClipboardList,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface Props {
  collections: { name: string; label: string }[];
  globals: { name: string; label: string }[];
}

export function AppSidebar({ collections }: Props) {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isLight = mounted && (resolvedTheme?.startsWith("light") ?? false);
  const wordmarkSrc = isLight
    ? "/webhouse-wordmark-light.svg"
    : "/webhouse-wordmark-dark.svg";
  const [showLogoIcon, setShowLogoIcon] = useState(false); // default: wordmark
  const [contentOpen, setContentOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("cms-sidebar-content-open");
    return saved !== null ? saved === "true" : true;
  });
  const [toolsOpen, setToolsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("cms-sidebar-tools-open");
    return saved !== null ? saved === "true" : false;
  });
  const [favorites, setFavorites] = useState<Array<{ id: string; type: string; label: string; path: string; icon?: string }>>(() => {
    if (typeof window === "undefined") return [];
    try {
      const cached = localStorage.getItem("cms-favorites");
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });

  // Load logo preference from shared context (profile)
  const { user: ctxUser, profile: ctxProfile } = useHeaderData();
  useEffect(() => {
    if (ctxProfile && typeof (ctxProfile as any).showLogoIcon === "boolean") {
      setShowLogoIcon((ctxProfile as any).showLogoIcon);
    }
  }, [ctxProfile]);

  // Sidebar content open: from per-site user-state
  useEffect(() => {
    fetch("/api/admin/user-state")
      .then((r) => r.ok ? r.json() : null)
      .then((state) => {
        if (!state) return;
        if (typeof state.sidebarContentOpen === "boolean") setContentOpen(state.sidebarContentOpen);
        if (typeof state.sidebarToolsOpen === "boolean") setToolsOpen(state.sidebarToolsOpen);
        if (Array.isArray(state.favorites)) {
          setFavorites(state.favorites);
          try { localStorage.setItem("cms-favorites", JSON.stringify(state.favorites)); } catch {}
        }
      })
      .catch(() => {});

    // Listen for favorites changes from FavoriteToggle across the app
    function onFavChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (Array.isArray(detail)) setFavorites(detail);
    }
    window.addEventListener("cms:favorites-changed", onFavChange);
    return () => window.removeEventListener("cms:favorites-changed", onFavChange);
  }, []);
  const [readyCount, setReadyCount] = useState(0);
  const [formUnreadTotal, setFormUnreadTotal] = useState(0);
  const [budgetSpent, setBudgetSpent] = useState(0);
  const [budgetTotal, setBudgetTotal] = useState(50);
  const siteRole = ctxUser?.siteRole ?? null;

  // Listen for logo icon preference changes
  useEffect(() => {
    function onLogoChange(e: Event) {
      setShowLogoIcon((e as CustomEvent).detail as boolean);
    }
    window.addEventListener("cms:logo-icon-changed", onLogoChange);
    return () => window.removeEventListener("cms:logo-icon-changed", onLogoChange);
  }, []);

  // Fetch curation queue count and budget on mount
  useEffect(() => {
    fetch("/api/cms/curation?stats=true")
      .then((r) => r.json())
      .then((stats: Record<string, number>) => {
        setReadyCount(stats.ready ?? 0);
      })
      .catch(() => {});

    // siteRole loaded from shared context (ctxUser) below

    function fetchFormCounts() {
      // Skip polling when tab is hidden — no point wasting requests
      if (document.visibilityState === "hidden") return;
      fetch("/api/admin/forms")
        .then((r) => r.json())
        .then((data: { forms?: Array<{ unread: number }> }) => {
          const total = (data.forms ?? []).reduce((sum, f) => sum + f.unread, 0);
          setFormUnreadTotal(total);
        })
        .catch(() => {});
    }
    fetchFormCounts();
    const formPoll = setInterval(fetchFormCounts, 30_000);

    fetch("/api/cms/command")
      .then((r) => r.json())
      .then((data: { currentMonthSpentUsd: number; monthlyBudgetUsd: number }) => {
        setBudgetSpent(data.currentMonthSpentUsd ?? 0);
        setBudgetTotal(data.monthlyBudgetUsd ?? 50);
      })
      .catch(() => {});

    return () => clearInterval(formPoll);
  }, []);

  const budgetPct = budgetTotal > 0 ? (budgetSpent / budgetTotal) * 100 : 0;
  const budgetColor =
    budgetPct > 90
      ? "bg-red-500"
      : budgetPct > 70
      ? "bg-yellow-500"
      : "bg-green-500";

  return (
    <Sidebar collapsible="offcanvas" data-testid="sidebar">
      {/* Header: stacked logo */}
      <SidebarHeader className="p-0">
        <Link href="/admin" className={`flex flex-col gap-2 px-3 ${showLogoIcon ? "items-center" : "items-start"}`} style={{ marginRight: "auto", marginLeft: "0.5rem", paddingTop: showLogoIcon ? "1.25rem" : "0.75rem", paddingBottom: showLogoIcon ? "1.25rem" : "0.75rem", textDecoration: "none" }}>
          {showLogoIcon ? (
            <img
              src={isLight ? "/webhouse.app-light-icon.svg" : "/webhouse.app-dark-icon.svg"}
              alt="webhouse.app"
              className="w-14 h-14"
            />
          ) : (
            <img
              src={isLight ? "/webhouse-wordmark-light.svg" : "/webhouse-wordmark-dark.svg"}
              alt="webhouse.app"
              className="h-11 w-auto"
              style={{ maxWidth: "100%", marginLeft: "-0.9rem" }}
            />
          )}
          <span style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: "0.75rem", marginTop: "-0.25rem", letterSpacing: "0.08em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }} className="text-muted-foreground">
            AI-native content engine
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Sites + Dashboard */}
        <SidebarGroup style={{ padding: "0.5rem 0.5rem 0" }}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin/sites"}
                tooltip="Sites"
                render={<Link href="/admin/sites" data-testid="nav-link-sites" />}
              >
                <Boxes className="!w-5 !h-5" />
                <span>Sites</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin"}
                tooltip="Dashboard"
                render={<Link href="/admin" data-testid="nav-link-dashboard" />}
              >
                <LayoutDashboard className="!w-5 !h-5" />
                <span>Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {favorites.length > 0 && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/admin/favorites"}
                  tooltip="Favorites"
                  render={<Link href="/admin/favorites" data-testid="nav-link-favorites" />}
                >
                  <Heart className="!w-5 !h-5" style={{ color: "#ef4444", fill: "#ef4444" }} />
                  <span className="flex-1">Favorites</span>
                  <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}>{favorites.length}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>

        {/* AI Section */}
        <SidebarGroup style={{ padding: "0 0.5rem" }}>
          <SidebarMenu>
            {siteRole === "admin" && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/admin/command"}
                  tooltip="Cockpit"
                  render={<Link href="/admin/command" data-testid="nav-link-cockpit" />}
                >
                  <Cpu className="!w-5 !h-5" />
                  <span>Cockpit</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname.startsWith("/admin/agents")}
                tooltip="Agents"
                render={<Link href="/admin/agents" data-testid="nav-link-agents" />}
              >
                <Bot className="!w-5 !h-5" />
                <span>Agents</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin/curation"}
                tooltip="Curation Queue"
                render={<Link href="/admin/curation" data-testid="nav-link-curation" />}
              >
                <Inbox className="!w-5 !h-5" />
                <span className="flex-1">Curation Queue</span>
                {readyCount > 0 && (
                  <span className="ml-auto flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {readyCount}
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin/scheduled"}
                tooltip="Calendar"
                render={<Link href="/admin/scheduled" data-testid="nav-link-calendar" />}
              >
                <Calendar className="!w-5 !h-5" />
                <span>Calendar</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Separator */}
        <div className="mx-3 my-1 border-t border-border" />

        {/* Content section (collapsible) */}
        <SidebarGroup style={{ padding: "0 0.5rem" }}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Content"
                onClick={() => setContentOpen((o) => { const next = !o; localStorage.setItem("cms-sidebar-content-open", String(next)); fetch("/api/admin/user-state", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sidebarContentOpen: next }) }).catch(() => {}); return next; })}
                render={<button type="button" data-testid="nav-link-content" />}
              >
                <FolderOpen className="!w-5 !h-5" />
                <span className="flex-1 text-left">Content</span>
                {contentOpen ? (
                  <ChevronDown className="!w-4 !h-4 ml-auto" />
                ) : (
                  <ChevronRight className="!w-4 !h-4 ml-auto" />
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {contentOpen && (
            <SidebarGroupContent>
              <SidebarMenu>
                {collections.map((col) => (
                  <SidebarMenuItem key={col.name}>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(`/admin/${col.name}`)}
                      tooltip={col.label}
                      render={<Link href={`/admin/${col.name}`} data-testid={`nav-link-collection-${col.name}`} />}
                      style={{ paddingLeft: "1.75rem" }}
                    >
                      <span>{col.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* Interactives & Media */}
        <SidebarGroup style={{ padding: "0 0.5rem" }}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname.startsWith("/admin/interactives")}
                tooltip="Interactives"
                render={<Link href="/admin/interactives" data-testid="nav-link-interactives" />}
              >
                <Zap className="!w-5 !h-5" />
                <span>Interactives</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin/media"}
                tooltip="Media library"
                render={<Link href="/admin/media" data-testid="nav-link-media" />}
              >
                <Image className="!w-5 !h-5" />
                <span>Media</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname.startsWith("/admin/forms")}
                tooltip="Forms"
                render={<Link href="/admin/forms" data-testid="nav-link-forms" />}
              >
                <ClipboardList className="!w-5 !h-5" />
                <span className="flex-1">Forms</span>
                {formUnreadTotal > 0 && (
                  <span className="ml-auto flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {formUnreadTotal}
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Separator */}
        <div className="mx-3 my-1 border-t border-border" />

        {/* Tools (collapsible) */}
        <SidebarGroup style={{ padding: "0 0.5rem" }}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Tools"
                onClick={() => setToolsOpen((o) => { const next = !o; localStorage.setItem("cms-sidebar-tools-open", String(next)); fetch("/api/admin/user-state", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sidebarToolsOpen: next }) }).catch(() => {}); return next; })}
                render={<button type="button" data-testid="nav-link-tools" />}
              >
                <Wrench className="!w-5 !h-5" />
                <span className="flex-1 text-left">Tools</span>
                {toolsOpen ? (
                  <ChevronDown className="!w-4 !h-4 ml-auto" />
                ) : (
                  <ChevronRight className="!w-4 !h-4 ml-auto" />
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {toolsOpen && (
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname === "/admin/link-checker"}
                    tooltip="Link Checker"
                    render={<Link href="/admin/link-checker" data-testid="nav-link-link-checker" />}
                    style={{ paddingLeft: "1.75rem" }}
                  >
                    <Link2 className="!w-5 !h-5" />
                    <span>Link Checker</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname === "/admin/seo"}
                    tooltip="SEO"
                    render={<Link href="/admin/seo" data-testid="nav-link-seo" />}
                    style={{ paddingLeft: "1.75rem" }}
                  >
                    <Search className="!w-5 !h-5" />
                    <span>SEO</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {siteRole === "admin" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={pathname === "/admin/backup"}
                      tooltip="Backup & Restore"
                      render={<Link href="/admin/backup" data-testid="nav-link-backup" />}
                      style={{ paddingLeft: "1.75rem" }}
                    >
                      <HardDrive className="!w-5 !h-5" />
                      <span>Backup</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname === "/admin/performance"}
                    tooltip="AI Analytics"
                    render={<Link href="/admin/performance" data-testid="nav-link-ai-analytics" />}
                    style={{ paddingLeft: "1.75rem" }}
                  >
                    <BarChart2 className="!w-5 !h-5" />
                    <span>AI Analytics</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname === "/admin/visibility"}
                    tooltip="Visibility"
                    render={<Link href="/admin/visibility" data-testid="nav-link-visibility" />}
                    style={{ paddingLeft: "1.75rem" }}
                  >
                    <Eye className="!w-5 !h-5" />
                    <span>Visibility</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname === "/admin/lighthouse"}
                    tooltip="Lighthouse"
                    render={<Link href="/admin/lighthouse" data-testid="nav-link-lighthouse" />}
                    style={{ paddingLeft: "1.75rem" }}
                  >
                    <Gauge className="!w-5 !h-5" />
                    <span>Lighthouse</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* ⌘K Search trigger */}
        <SidebarGroup style={{ padding: "0 0.5rem" }}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Search (⌘K)"
                onClick={() =>
                  window.dispatchEvent(
                    new KeyboardEvent("keydown", {
                      key: "k",
                      metaKey: true,
                      bubbles: true,
                    })
                  )
                }
                render={<button type="button" data-testid="nav-link-search" />}
              >
                <Search className="!w-5 !h-5" />
                <span className="flex-1 text-left">Search</span>
                <span className="ml-auto flex items-center gap-0.5">
                  <kbd
                    className="text-[11px] rounded border border-sidebar-border text-muted-foreground leading-none"
                    style={{
                      fontFamily: "system-ui, -apple-system, sans-serif",
                      width: "18px",
                      height: "18px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ⌘
                  </kbd>
                  <kbd
                    className="text-[11px] rounded border border-sidebar-border text-muted-foreground leading-none"
                    style={{
                      fontFamily: "system-ui, -apple-system, sans-serif",
                      width: "18px",
                      height: "18px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    K
                  </kbd>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter style={{ paddingBottom: "3rem" }}>
        {/* Site Settings + Trash — role-gated */}
        <SidebarGroup style={{ padding: "0.25rem 0.5rem 0" }}>
          <SidebarMenu>
            {siteRole === "admin" && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/admin/settings")}
                  tooltip="Site Settings"
                  render={<Link href="/admin/settings" data-testid="nav-link-settings" />}
                >
                  <Settings2 className="!w-5 !h-5" />
                  <span>Site Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {siteRole !== "viewer" && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/admin/trash"}
                  tooltip="Trash"
                  render={<Link href="/admin/trash" data-testid="nav-link-trash" />}
                >
                  <Trash2 className="!w-5 !h-5" />
                  <span>Trash</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>

        <div className="border-t border-border" />

        {/* Usage bar */}
        <div className="px-3 pb-2">
          <div className="text-[10px] text-muted-foreground mb-1 font-mono">
            Usage: {Math.round(budgetPct)}%
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${budgetColor}`}
              style={{ width: `${Math.min(100, budgetPct)}%` }}
            />
          </div>
        </div>

      </SidebarFooter>
    </Sidebar>
  );
}
