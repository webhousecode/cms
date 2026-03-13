"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
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
      {/* Header: logo */}
      <SidebarHeader className="p-0">
        <div className="flex h-12 items-center gap-2 px-3">
          <Link
            href="/admin"
            className="sidebar-logo flex items-center gap-2 min-w-0"
          >
            <img
              src="/cms-logo-icon.svg"
              alt=""
              className="h-7 w-7 shrink-0"
              aria-hidden="true"
            />
            <span className="font-bold text-base tracking-tight text-foreground truncate">
              @webhouse/cms
            </span>
          </Link>
        </div>
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

        {/* Budget bar */}
        <div className="px-3 pb-2">
          <div className="text-[10px] text-muted-foreground mb-1 font-mono">
            AI Budget: ${budgetSpent.toFixed(2)} / ${budgetTotal.toFixed(2)}
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
