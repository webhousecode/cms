// Admin UI is always server-rendered on demand — never statically prerendered
export const dynamic = "force-dynamic";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebarClient } from "@/components/sidebar-client";
import { getAdminConfig, getActiveSiteInfo } from "@/lib/cms";
import { CommandPaletteProvider } from "@/components/command-palette";
import { TabsProvider } from "@/lib/tabs-context";
import { TabBar } from "@/components/tab-bar";
import { AdminHeader } from "@/components/admin-header";
import { DevInspector } from "@/components/dev-inspector";
import { ZoomApplier } from "@/components/zoom-applier";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const siteInfo = await getActiveSiteInfo();

  // Multi-site mode with no site selected → minimal layout (Sites Dashboard)
  if (siteInfo && !siteInfo.activeSiteId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--background)" }}>
        <AdminHeader />
        {children}
      </div>
    );
  }

  // Normal workspace layout (single-site mode or site selected)
  const config = await getAdminConfig();

  const allCollections = config.collections.map((c) => ({
    name: c.name,
    label: c.label ?? c.name,
  }));
  const collections = allCollections
    .filter((c) => c.name !== "global")
    .sort((a, b) => a.label.localeCompare(b.label));
  const globals = allCollections.filter((c) => c.name === "global");

  return (
    <SidebarProvider>
      <AppSidebarClient collections={collections} globals={globals} />
      <SidebarInset>
        <TabsProvider>
          <AdminHeader />
          <TabBar />
          <CommandPaletteProvider>
            {children}
            <footer className="mt-16 py-8 flex items-center justify-center gap-2 opacity-25 hover:opacity-40 transition-opacity">
              <img src="/webhouse.app-dark-icon.svg" alt="" className="h-5 w-5 dark:block hidden" />
              <img src="/webhouse.app-light-icon.svg" alt="" className="h-5 w-5 dark:hidden block" />
              <img src="/webhouse-wordmark-dark.svg" alt="webhouse.app" className="h-4 dark:block hidden" />
              <img src="/webhouse-wordmark-light.svg" alt="webhouse.app" className="h-4 dark:hidden block" />
              <span className="text-xs font-mono text-muted-foreground">v0.1</span>
            </footer>
          </CommandPaletteProvider>
          <DevInspector />
          <ZoomApplier />
        </TabsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
