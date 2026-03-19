// Admin UI is always server-rendered on demand — never statically prerendered
export const dynamic = "force-dynamic";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebarClient } from "@/components/sidebar-client";
import { getAdminConfig, getActiveSiteInfo, EmptyOrgError } from "@/lib/cms";
import { CommandPaletteProvider } from "@/components/command-palette";
import { TabsProvider } from "@/lib/tabs-context";
import { TabBar } from "@/components/tab-bar";
import { AdminHeader } from "@/components/admin-header";
import { DevInspector } from "@/components/dev-inspector";
import { SchedulerNotifier } from "@/components/scheduler-notifier";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";
import { findFirstAccessibleSite } from "@/lib/team-access";
import { NoAccessGate, ConnectGitHubGate, SiteRedirectGate, GitHubErrorGate } from "@/components/gate-screen";
import { redirect } from "next/navigation";

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
    // Empty org (no sites) — full layout but no collections
    if (err instanceof EmptyOrgError) {
      return (
        <SidebarProvider>
          <AppSidebarClient collections={[]} globals={[]} />
          <SidebarInset>
            <TabsProvider>
              <AdminHeader />
              <TabBar />
              <CommandPaletteProvider>
                {children}
              </CommandPaletteProvider>
            </TabsProvider>
          </SidebarInset>
        </SidebarProvider>
      );
    }
    const message = err instanceof Error ? err.message : "";
    if (message.includes("GitHub not connected")) {
      const members = await getTeamMembers();
      const membership = session ? members.find((m) => m.userId === session.sub) : null;
      if (membership?.role === "admin") {
        return <ConnectGitHubGate />;
      }
      return <ConnectGitHubGate message="An administrator needs to connect GitHub for this site before you can access it." showButton={false} />;
    }
    // GitHub API error (rate limit, bad token, etc.) — show recoverable error
    if (message.includes("GitHub:")) {
      return <GitHubErrorGate message={message} />;
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
          <SchedulerNotifier />
        </TabsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
