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
import { SchedulerNotifier } from "@/components/scheduler-notifier";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";
import { findFirstAccessibleSite } from "@/lib/team-access";
import { NoAccessGate, ConnectGitHubGate, SiteRedirectGate } from "@/components/gate-screen";

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

  // ── Team membership gate ─────────────────────────────────
  // Ensure the authenticated user is a member of the active site.
  // If not, redirect them to a site they DO have access to.
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (session) {
    const members = await getTeamMembers();
    const isMember = members.some((m) => m.userId === session.sub);
    if (!isMember) {
      const accessible = await findFirstAccessibleSite(session.sub);
      if (accessible) {
        return <SiteRedirectGate siteId={accessible.siteId} orgId={accessible.orgId} />;
      }
      return <NoAccessGate />;
    }
  }

  // ── Load site config ─────────────────────────────────────
  let config;
  try {
    config = await getAdminConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("GitHub not connected")) {
      // Only admins see "Connect GitHub" — editors should never reach this
      // because the service token (saved by admin) should work for them.
      // If they DO reach this, it means no admin has connected GitHub yet.
      const members = await getTeamMembers();
      const membership = session ? members.find((m) => m.userId === session.sub) : null;
      if (membership?.role === "admin") {
        return <ConnectGitHubGate />;
      }
      // Editor/viewer without service token — admin needs to connect first
      return <ConnectGitHubGate message="An administrator needs to connect GitHub for this site before you can access it." showButton={false} />;
    }
    throw err;
  }

  // ── Normal workspace layout ──────────────────────────────
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
          <SchedulerNotifier />
        </TabsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
