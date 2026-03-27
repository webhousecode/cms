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
  children: React.ReactNode;
}

export function WorkspaceShell({ collections, globals, activeSiteId, children }: WorkspaceShellProps) {
  const { mode, toggle } = useAdminMode();

  // Keyboard shortcut: Cmd+Shift+C to toggle mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "." && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  if (mode === "chat") {
    return (
      <TabsProvider siteId={activeSiteId}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--background)" }}>
          <AdminHeader mode={mode} onToggleMode={toggle} />
          <ChatInterface collections={collections} activeSiteId={activeSiteId} />
        </div>
      </TabsProvider>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebarClient collections={collections} globals={globals} />
      <SidebarInset>
        <TabsProvider siteId={activeSiteId}>
          <AdminHeader mode={mode} onToggleMode={toggle} />
          <TabBar />
          <CommandPaletteProvider>
            {children}
          </CommandPaletteProvider>
          <DevInspector />
          <SchedulerNotifier />
        </TabsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
