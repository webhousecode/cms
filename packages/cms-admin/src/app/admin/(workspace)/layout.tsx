// Admin UI is always server-rendered on demand — never statically prerendered
export const dynamic = "force-dynamic";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { getAdminConfig, getActiveSiteInfo, EmptyOrgError } from "@/lib/cms";
import { readSiteConfig } from "@/lib/site-config";
import { TabsProvider } from "@/lib/tabs-context";
import { AdminHeader } from "@/components/admin-header";
import { WorkspaceShell } from "@/components/workspace-shell";
import { cookies, headers } from "next/headers";
import { isAdminEmpty } from "@/lib/admin-empty";
import { getSessionUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";
import { findFirstAccessibleSite } from "@/lib/team-access";
import { NoAccessGate, ConnectGitHubGate, SiteRedirectGate, GitHubErrorGate } from "@/components/gate-screen";
import { ConfigRepairPanel } from "@/components/config-repair-panel";
import { OrgSidebar } from "@/components/org-sidebar";
import { redirect } from "next/navigation";
import { loadRegistry, findSite, findOrg } from "@/lib/site-registry";
import { readUserState } from "@/lib/user-state";
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

/**
 * F138-B: paths that work without any site existing. Anything else
 * (including /admin root and /admin/favorites — both site-scoped in
 * practice) gets redirected to /admin/sites with a "create-first"
 * notice when the admin is empty.
 */
const EMPTY_ADMIN_ALLOWED_PREFIXES = [
  "/admin/sites",
  "/admin/organizations",
  "/admin/account",
  "/admin/admin",
];

function isAllowedInEmptyAdmin(pathname: string): boolean {
  return EMPTY_ADMIN_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // ── F138-B: redirect site-scoped pages when admin is empty ──
  // Compute once; reuse downstream as a server-rendered seed for the
  // client HeaderDataProvider so the sidebar's empty-admin gating
  // renders correctly on first paint (no FOUC).
  const adminEmpty = await isAdminEmpty();
  if (adminEmpty) {
    const hdrs = await headers();
    const pathname = hdrs.get("x-pathname") ?? hdrs.get("x-invoke-path") ?? hdrs.get("next-url") ?? "";
    if (pathname && !isAllowedInEmptyAdmin(pathname)) {
      redirect("/admin/sites?notice=create-first");
    }
  }

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

  // ── Empty org gate (MUST be first — before any site-dependent code) ──
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  const activeSiteId = cookieStore.get("cms-active-site")?.value ?? "no-site";
  const activeOrgCookie = cookieStore.get("cms-active-org")?.value;

  if (activeOrgCookie) {
    const reg = await loadRegistry();
    if (reg) {
      const org = findOrg(reg, activeOrgCookie);
      if (org && org.sites.length === 0) {
        return (
          <SidebarProvider>
            <OrgSidebar />
            <SidebarInset>
              <TabsProvider siteId="no-site">
                <AdminHeader />
                {children}
              </TabsProvider>
            </SidebarInset>
          </SidebarProvider>
        );
      }
    }
  }

  // ── Team membership gate ─────────────────────────────────
  if (session) {
    const members = await getTeamMembers();
    const isMember = session.sub === "dev-token" || members.some((m) => m.userId === session.sub);
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
    if (err instanceof Error && err.name === "EmptyOrgError") {
      // Already handled above, but catch any stragglers
      return (
        <SidebarProvider><OrgSidebar /><SidebarInset><TabsProvider siteId="no-site"><AdminHeader />{children}</TabsProvider></SidebarInset></SidebarProvider>
      );
    }
    const message = err instanceof Error ? err.message : "";
    if (message.includes("GitHub not connected")) {
      const members = await getTeamMembers();
      const membership = session?.sub === "dev-token" ? { role: "admin" } : (session ? members.find((m) => m.userId === session.sub) : null);
      if (membership?.role === "admin") {
        return <ConnectGitHubGate />;
      }
      return <ConnectGitHubGate message="An administrator needs to connect GitHub for this site before you can access it." showButton={false} />;
    }
    // GitHub API error (rate limit, bad token, etc.) — show recoverable error
    if (message.includes("GitHub:")) {
      return <GitHubErrorGate message={message} />;
    }
    // Site config validation error (bad cms.config.ts) — render inside workspace.
    // A broken site must never crash the whole server and block access to all other sites.
    // The repair panel diagnoses with Haiku and offers a one-click auto-fix.
    if (message.includes("config validation failed")) {
      const nameMatch = /^Site "([^"]+)"/.exec(message);
      const siteName = nameMatch?.[1] ?? "Unknown site";
      const rawErrors = message.slice(message.indexOf(":") + 1).trim();
      return (
        <SidebarProvider>
          <OrgSidebar />
          <SidebarInset>
            <TabsProvider siteId="repair-mode">
              <AdminHeader />
              <ConfigRepairPanel siteName={siteName} rawErrors={rawErrors} />
            </TabsProvider>
          </SidebarInset>
        </SidebarProvider>
      );
    }
    throw err;
  }

  // ── Read site-level settings ────────────────────────────
  const siteConfig = await readSiteConfig();

  // ── Normal workspace layout ──────────────────────────────
  // All user-defined collections live under Content in the sidebar, no matter
  // what they're named. Namespaced routing (/admin/content/[collection]) means
  // a collection named `visibility`, `media`, or `global` can no longer collide
  // with built-in admin panels — so we no longer special-case any name.
  const collections = config.collections
    .map((c) => ({ name: c.name, label: c.label ?? c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const globals: Array<{ name: string; label: string }> = [];

  // Read onboarding state for the current user (F120)
  const userId = session?.sub ?? "anonymous";
  const userState = await readUserState(userId);
  const forceOnboarding = process.env.ONBOARDING === "true";

  return (
    <WorkspaceShell
      collections={collections}
      globals={globals}
      activeSiteId={activeSiteId}
      devInspector={siteConfig.devInspector}
      onboarding={userState.onboarding}
      locale={siteConfig.defaultLocale || config.defaultLocale || "en"}
      forceOnboarding={forceOnboarding}
      isAdminEmpty={adminEmpty}
    >
      {children}
    </WorkspaceShell>
  );
}
