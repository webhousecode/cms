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
  let config;
  try {
    config = await getAdminConfig();
  } catch (err) {
    // GitHub-backed site without token — show connect prompt
    const message = err instanceof Error ? err.message : "Failed to load site config";
    if (message.includes("GitHub not connected")) {
      return (
        <div style={{ minHeight: "100vh", background: "var(--background)" }}>
          <AdminHeader />
          <div style={{ maxWidth: 480, margin: "4rem auto", padding: "2rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.9rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
              This site requires GitHub access. Please connect your GitHub account to continue.
            </p>
            <a
              href="/api/auth/github"
              style={{
                display: "inline-block",
                padding: "0.6rem 1.5rem",
                borderRadius: "8px",
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Connect GitHub
            </a>
          </div>
        </div>
      );
    }
    throw err; // Re-throw other errors
  }

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
          </CommandPaletteProvider>
          <DevInspector />
          <ZoomApplier />
        </TabsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
