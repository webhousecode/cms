// Admin UI is always server-rendered on demand — never statically prerendered
export const dynamic = "force-dynamic";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebarClient } from "@/components/sidebar-client";
import { getAdminConfig } from "@/lib/cms";
import { CommandPaletteProvider } from "@/components/command-palette";
import { TabsProvider } from "@/lib/tabs-context";
import { TabBar } from "@/components/tab-bar";
import { AdminHeader } from "@/components/admin-header";
import { DevInspector } from "@/components/dev-inspector";
import { ZoomApplier } from "@/components/zoom-applier";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const config = await getAdminConfig();

  const collections = config.collections.map((c) => ({
    name: c.name,
    label: c.label ?? c.name,
  }));

  return (
    <SidebarProvider>
      <AppSidebarClient collections={collections} />
      <SidebarInset>
        <TabsProvider>
          <AdminHeader />
          <TabBar />
          <CommandPaletteProvider>
            {children}
            <footer className="mt-auto py-4 text-center">
              <p className="text-[10px] font-mono text-muted-foreground/40">@webhouse/cms v0.1</p>
            </footer>
          </CommandPaletteProvider>
          <DevInspector />
          <ZoomApplier />
        </TabsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
