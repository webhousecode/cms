"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebarClient } from "@/components/sidebar-client";
import { CommandPaletteProvider } from "@/components/command-palette";
import { TabsProvider } from "@/lib/tabs-context";
import { TabBar } from "@/components/tab-bar";
import { AdminHeader } from "@/components/admin-header";
import { HeaderDataProvider } from "@/lib/header-data-context";
import { useRouter } from "next/navigation";
import { DevInspector } from "@/components/dev-inspector";
import { SchedulerNotifier } from "@/components/scheduler-notifier";
import { ChatInterface } from "@/components/chat/chat-interface";
import { TourProvider } from "@/components/onboarding/tour-provider";
import { useAdminMode } from "@/lib/hooks/use-admin-mode";
import { useEffect } from "react";
import type { OnboardingState } from "@/lib/user-state";

interface WorkspaceShellProps {
  collections: Array<{ name: string; label: string }>;
  globals: Array<{ name: string; label: string }>;
  activeSiteId: string;
  devInspector?: boolean;
  onboarding?: OnboardingState;
  locale?: string;
  forceOnboarding?: boolean;
  children: React.ReactNode;
}

export function WorkspaceShell({ collections, globals, activeSiteId, devInspector, onboarding, locale, forceOnboarding, children }: WorkspaceShellProps) {
  const { mode, toggle, setMode } = useAdminMode();
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

  // Listen for navigate-to-doc events from chat (Edit pill)
  const router = useRouter();
  useEffect(() => {
    function onNavigate(e: Event) {
      const { path } = (e as CustomEvent).detail;
      setMode("traditional");
      router.push(path);
    }
    window.addEventListener("cms:navigate-to-doc", onNavigate);
    return () => window.removeEventListener("cms:navigate-to-doc", onNavigate);
  }, [setMode, router]);

  // Auto-refresh server components when content changes (new document created,
  // published, trashed, etc.) so sidebar counts and other server-rendered data
  // stay up to date without manual page reload.
  useEffect(() => {
    function refresh() { router.refresh(); }
    window.addEventListener("cms:content-changed", refresh);
    return () => { window.removeEventListener("cms:content-changed", refresh); };
  }, [router]);

  // Render BOTH modes, hide the inactive one with CSS.
  // This keeps the traditional workspace mounted (tabs, sidebar, state preserved)
  // so switching back is instant.
  return (
    <HeaderDataProvider>
    <SidebarProvider>
      <div style={{ display: isChat ? "none" : "contents" }}>
        <AppSidebarClient collections={collections} globals={globals} />
      </div>
      <SidebarInset>
        <TabsProvider key={activeSiteId ?? "no-site"} siteId={activeSiteId}>
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
              <TourProvider
                initialOnboarding={onboarding ?? { tourCompleted: true, completedSteps: [], activeTour: null, firstLoginAt: null }}
                locale={locale ?? "en"}
                forceOnboarding={forceOnboarding}
              >
                {children}
              </TourProvider>
            </CommandPaletteProvider>
            {devInspector && <DevInspector />}
            <SchedulerNotifier />
          </div>
        </TabsProvider>
      </SidebarInset>
    </SidebarProvider>
    </HeaderDataProvider>
  );
}
