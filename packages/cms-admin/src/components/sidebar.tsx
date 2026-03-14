"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
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
  ChevronDown,
  ChevronRight,
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
  const wordmarkSrc = mounted && resolvedTheme === "light"
    ? "/webhouse-wordmark-light.svg"
    : "/webhouse-wordmark-dark.svg";
  const [contentOpen, setContentOpen] = useState(true);
  const [readyCount, setReadyCount] = useState(0);
  const [budgetSpent, setBudgetSpent] = useState(0);
  const [budgetTotal, setBudgetTotal] = useState(50);

  // Fetch curation queue count and budget on mount
  useEffect(() => {
    fetch("/api/cms/curation?stats=true")
      .then((r) => r.json())
      .then((stats: Record<string, number>) => {
        setReadyCount(stats.ready ?? 0);
      })
      .catch(() => {});

    fetch("/api/cms/command")
      .then((r) => r.json())
      .then((data: { currentMonthSpentUsd: number; monthlyBudgetUsd: number }) => {
        setBudgetSpent(data.currentMonthSpentUsd ?? 0);
        setBudgetTotal(data.monthlyBudgetUsd ?? 50);
      })
      .catch(() => {});
  }, []);

  const budgetPct = budgetTotal > 0 ? (budgetSpent / budgetTotal) * 100 : 0;
  const budgetColor =
    budgetPct > 90
      ? "bg-red-500"
      : budgetPct > 70
      ? "bg-yellow-500"
      : "bg-green-500";

  return (
    <Sidebar collapsible="offcanvas">
      {/* Header: stacked logo */}
      <SidebarHeader className="p-0">
        <Link href="/admin" className="flex flex-col items-center gap-2 py-5 px-4">
          {/* Eye icon */}
          <svg viewBox="0 0 335.2 338.48" className="w-14 h-14">
            <path fill={mounted && resolvedTheme === "light" ? "#1c1c1c" : "#2a2a3e"} d="M167.6,0C87.6,0,7.6,48,7.6,144s48,169.6,112,192c32,9.6,48-9.6,48-41.6"/>
            <path fill={mounted && resolvedTheme === "light" ? "#0d0d0d" : "#212135"} d="M7.6,144c-16,48-6.4,118.4,25.6,156.8,25.6,25.6,64,38.4,86.4,35.2"/>
            <path fill="#f7bb2e" d="M167.6,0c80,0,160,48,160,144s-48,169.6-112,192c-32,9.6-48-9.6-48-41.6"/>
            <path fill="#d9a11a" d="M327.6,144c16,48,6.4,118.4-25.6,156.8-25.6,25.6-64,38.4-86.4,35.2"/>
            <path fill="#fff" d="M52.4,160c38.4-59.73,76.8-89.6,115.2-89.6s76.8,29.87,115.2,89.6c-38.4,59.73-76.8,89.6-115.2,89.6s-76.8-29.87-115.2-89.6Z"/>
            <circle fill="#f7bb2e" cx="167.6" cy="160" r="48"/>
            <circle fill="#0d0d0d" cx="167.6" cy="160" r="20.8"/>
            <circle fill="#fff" opacity=".9" cx="180.4" cy="147.2" r="8.96"/>
            <circle fill="#fff" opacity=".3" cx="158" cy="171.2" r="4.16"/>
          </svg>
          {/* Wordmark */}
          <span className="text-lg font-bold tracking-tight">
            <span className="text-foreground">webhouse</span>
            <span style={{ color: "#F7BB2E" }}>.app</span>
          </span>
          {/* Tagline */}
          <span style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: "0.6rem", letterSpacing: "0.08em" }} className="text-muted-foreground">
            AI-native content engine
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Dashboard */}
        <SidebarGroup style={{ padding: "0.5rem 0.5rem 0" }}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin"}
                tooltip="Dashboard"
                render={<Link href="/admin" />}
              >
                <LayoutDashboard className="!w-5 !h-5" />
                <span>Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* AI Section */}
        <SidebarGroup style={{ padding: "0 0.5rem" }}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin/command"}
                tooltip="AI Cockpit"
                render={<Link href="/admin/command" />}
              >
                <Cpu className="!w-5 !h-5" />
                <span>AI Cockpit</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname.startsWith("/admin/agents")}
                tooltip="AI Agents"
                render={<Link href="/admin/agents" />}
              >
                <Bot className="!w-5 !h-5" />
                <span>AI Agents</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin/curation"}
                tooltip="Curation Queue"
                render={<Link href="/admin/curation" />}
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
                onClick={() => setContentOpen((o) => !o)}
                render={<button type="button" />}
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
                      render={<Link href={`/admin/${col.name}`} />}
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

        {/* Media & Links */}
        <SidebarGroup style={{ padding: "0 0.5rem" }}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin/media"}
                tooltip="Media library"
                render={<Link href="/admin/media" />}
              >
                <Image className="!w-5 !h-5" />
                <span>Media</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin/link-checker"}
                tooltip="Link checker"
                render={<Link href="/admin/link-checker" />}
              >
                <Link2 className="!w-5 !h-5" />
                <span>Link checker</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Separator */}
        <div className="mx-3 my-1 border-t border-border" />

        {/* Performance */}
        <SidebarGroup style={{ padding: "0 0.5rem" }}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin/performance"}
                tooltip="Performance"
                render={<Link href="/admin/performance" />}
              >
                <BarChart2 className="!w-5 !h-5" />
                <span>Performance</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
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
                render={<button type="button" />}
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
        {/* Trash */}
        <SidebarGroup style={{ padding: "0.25rem 0.5rem 0" }}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/admin/trash"}
                tooltip="Trash"
                render={<Link href="/admin/trash" />}
              >
                <Trash2 className="!w-5 !h-5" />
                <span>Trash</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <div className="border-t border-border" />

        {/* Usage bar */}
        <div className="px-3 pb-2">
          <div className="text-[10px] text-muted-foreground mb-1 font-mono">
            AI Usage: {Math.round(budgetPct)}%
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
