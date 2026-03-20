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
import { OrgSidebar } from "@/components/org-sidebar";
import { redirect } from "next/navigation";
import { loadRegistry, findSite } from "@/lib/site-registry";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const registry = await loadRegistry();
    if (!registry) return { title: "webhouse.app" };
    const cookieStore = await cookies();
    const orgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
    const siteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;
    const site = findSite(registry, orgId, siteId);
    if (site?.name) return { title: site.name };
  } catch { /* fall through */ }
  return { title: "webhouse.app" };
}

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
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  const activeSiteId = cookieStore.get("cms-active-site")?.value ?? "no-site";

  // Helper: render empty-org layout (OrgSidebar, no collections)
  const renderEmptyOrg = () => (
    <SidebarProvider>
      <OrgSidebar />
      <SidebarInset>
        <TabsProvider siteId={activeSiteId}>
          <AdminHeader />
          {children}
        </TabsProvider>
      </SidebarInset>
    </SidebarProvider>
  );

  // Team check — skip for empty orgs (no team file exists)
  if (session) {
    try {
      const members = await getTeamMembers();
      const isMember = members.some((m) => m.userId === session.sub);
      if (!isMember) {
        const accessible = await findFirstAccessibleSite(session.sub);
        if (accessible) {
          return <SiteRedirectGate siteId={accessible.siteId} orgId={accessible.orgId} />;
        }
        return <NoAccessGate />;
      }
    } catch (err) {
      if (err instanceof EmptyOrgError) return renderEmptyOrg();
      throw err;
    }
  }

  // ── Load site config ─────────────────────────────────────
  let config;
  try {
    config = await getAdminConfig();
  } catch (err) {
    if (err instanceof EmptyOrgError) return renderEmptyOrg();
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
        <TabsProvider siteId={activeSiteId}>
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
