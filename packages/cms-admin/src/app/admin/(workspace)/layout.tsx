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
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { redirect } from "next/navigation";
import fs from "fs/promises";
import path from "path";

/**
 * Find the first site the user has team membership on.
 * Returns { orgId, siteId } or null.
 */
async function findAccessibleSite(userId: string): Promise<{ orgId: string; siteId: string } | null> {
  const registry = await loadRegistry();
  if (!registry) return null; // single-site mode

  const configPath = process.env.CMS_CONFIG_PATH;

  for (const org of registry.orgs) {
    for (const site of org.sites) {
      let dataDir: string;
      if (site.adapter === "github" || site.configPath.startsWith("github://")) {
        const cacheBase = configPath
          ? path.join(path.dirname(path.resolve(configPath)), ".cache")
          : path.join(process.env.HOME ?? "/tmp", ".webhouse", ".cache");
        dataDir = path.join(cacheBase, "sites", site.id, "_data");
      } else {
        const abs = path.resolve(site.configPath);
        const projDir = path.dirname(abs);
        const contentDir = site.contentDir ?? path.join(projDir, "content");
        dataDir = path.join(contentDir, "..", "_data");
      }
      try {
        const content = await fs.readFile(path.join(dataDir, "team.json"), "utf-8");
        const members = JSON.parse(content) as { userId: string }[];
        if (members.some((m) => m.userId === userId)) {
          return { orgId: org.id, siteId: site.id };
        }
      } catch { /* no team.json */ }
    }
  }
  return null;
}

function SiteRedirect({ siteId, orgId }: { siteId: string; orgId: string }) {
  // Client component that sets cookies and redirects — rendered as <script> for instant execution
  const script = `
    document.cookie = "cms-active-site=${siteId};path=/;max-age=31536000;samesite=lax";
    document.cookie = "cms-active-org=${orgId};path=/;max-age=31536000;samesite=lax";
    window.location.href = "/admin";
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
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

  // Check team membership on active site — redirect if no access
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (session) {
    const members = await getTeamMembers();
    const isMember = members.some((m) => m.userId === session.sub);
    if (!isMember) {
      // Try to find a site the user DOES have access to
      const accessible = await findAccessibleSite(session.sub);
      if (accessible) {
        // Client-side redirect that sets cookies then reloads
        return (
          <div style={{ minHeight: "100vh", background: "var(--background)" }}>
            <SiteRedirect siteId={accessible.siteId} orgId={accessible.orgId} />
          </div>
        );
      }
      // No access to any site
      return (
        <div style={{ minHeight: "100vh", background: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 480, padding: "2rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.9rem", color: "var(--muted-foreground)" }}>
              You don&apos;t have access to any sites yet. Ask an admin to invite you.
            </p>
          </div>
        </div>
      );
    }
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
        <div style={{ minHeight: "100vh", background: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 480, padding: "2rem", textAlign: "center" }}>
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
