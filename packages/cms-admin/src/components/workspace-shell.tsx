"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebarClient } from "@/components/sidebar-client";
import { CommandPaletteProvider } from "@/components/command-palette";
import { TabsProvider } from "@/lib/tabs-context";
import { TabBar } from "@/components/tab-bar";
import { AdminHeader } from "@/components/admin-header";
import { DevInspector } from "@/components/dev-inspector";
import { SchedulerNotifier } from "@/components/scheduler-notifier";
import { ChatInterface } from "@/components/chat/chat-interface";
import { useAdminMode } from "@/lib/hooks/use-admin-mode";
import { useEffect } from "react";

interface WorkspaceShellProps {
  collections: Array<{ name: string; label: string }>;
  globals: Array<{ name: string; label: string }>;
  activeSiteId: string;
  devInspector?: boolean;
  children: React.ReactNode;
}

export function WorkspaceShell({ collections, globals, activeSiteId, devInspector, children }: WorkspaceShellProps) {
  const { mode, toggle } = useAdminMode();
  const isChat = mode === "chat";

  // Keyboard shortcut: Ctrl+Shift+C or Cmd+Shift+. to toggle mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "." || e.key === "C" || e.key === "c") && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Render BOTH modes, hide the inactive one with CSS.
  // This keeps the traditional workspace mounted (tabs, sidebar, state preserved)
  // so switching back is instant.
  return (
    <SidebarProvider>
      <div style={{ display: isChat ? "none" : "contents" }}>
        <AppSidebarClient collections={collections} globals={globals} />
      </div>
      <SidebarInset>
        <TabsProvider siteId={activeSiteId}>
          {/* ── Chat mode (shown/hidden via CSS) ── */}
          <div
            style={{
              display: isChat ? "flex" : "none",
              flexDirection: "column",
              minHeight: "100vh",
              background: "var(--background)",
            }}
          >
            <AdminHeader
              mode={mode}
              onToggleMode={toggle}
              onNewChat={() => window.dispatchEvent(new Event("chat-new"))}
              onToggleHistory={() => window.dispatchEvent(new Event("chat-toggle-history"))}
            />
            <ChatInterface collections={collections} activeSiteId={activeSiteId} visible={isChat} />
          </div>

          {/* ── Traditional mode (shown/hidden via CSS) ── */}
          <div style={{ display: isChat ? "none" : "contents" }}>
            <AdminHeader mode={mode} onToggleMode={toggle} />
            <TabBar />
            <CommandPaletteProvider>
              {children}
            </CommandPaletteProvider>
            {devInspector && <DevInspector />}
            <SchedulerNotifier />
          </div>
        </TabsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
