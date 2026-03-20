"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Globe, MoreVertical, Settings2, Plus, Copy, Eye, ExternalLink } from "lucide-react";
import { useSiteRole } from "@/hooks/use-site-role";
import { useTabs } from "@/lib/tabs-context";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SiteEntry {
  id: string;
  name: string;
  adapter: "filesystem" | "github";
  configPath: string;
  contentDir?: string;
  previewUrl?: string;
}

interface OrgEntry {
  id: string;
  name: string;
  sites: SiteEntry[];
}

interface Registry {
  orgs: OrgEntry[];
  defaultOrgId: string;
  defaultSiteId: string;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

export default function SitesDashboard() {
  const router = useRouter();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [stats, setStats] = useState<Record<string, { pages: number; collections: number }>>({});
  const [allowedSiteIds, setAllowedSiteIds] = useState<string[] | null>(null);
  const siteRole = useSiteRole();
  const { openTab } = useTabs();
  const isAdmin = siteRole === "admin";

  const [loaded, setLoaded] = useState(false);
  const [healthMap, setHealthMap] = useState<Record<string, "up" | "down" | "no-preview">>({});
  const [liveUrls, setLiveUrls] = useState<Record<string, string>>({});

  const loadSites = useCallback(() => {
    setLoaded(false);
    setStats({});
    setHealthMap({});
    setLiveUrls({});
    Promise.all([
      fetch("/api/cms/registry").then((r) => r.json()),
      fetch("/api/admin/my-sites").then((r) => r.json()),
    ]).then(([d, mySites]: [{ mode: string; registry: Registry | null }, { siteIds: string[] }]) => {
        setAllowedSiteIds(mySites.siteIds);
        if (d.registry) {
          setRegistry(d.registry);
          const orgId = getCookie("cms-active-org") ?? d.registry.defaultOrgId;
          setActiveOrgId(orgId);

          const org = d.registry.orgs.find((o) => o.id === orgId) ?? d.registry.orgs[0];
          if (org) {
            for (const site of org.sites) {
              fetch(`/api/cms/registry/stats?orgId=${orgId}&siteId=${site.id}`)
                .then((r) => r.json())
                .then((s: { pages: number; collections: number }) => {
                  setStats((prev) => ({ ...prev, [site.id]: s }));
                })
                .catch(() => {});
            }
          }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    fetch("/api/admin/site-health?all=true")
      .then((r) => r.ok ? r.json() : { sites: {} })
      .then((d: { sites: Record<string, "up" | "down" | "no-preview">; urls?: Record<string, string> }) => {
        setHealthMap(d.sites ?? {});
        setLiveUrls(d.urls ?? {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadSites(); }, [loadSites]);

  const activeOrg = registry?.orgs.find((o) => o.id === activeOrgId) ?? registry?.orgs[0];
  // Filter to only sites the user has team access to
  const visibleSites = activeOrg?.sites.filter((s) =>
    !allowedSiteIds || allowedSiteIds.includes(s.id)
  ) ?? [];

  function persistSiteChoice(siteId: string) {
    setCookie("cms-active-site", siteId);
    setCookie("cms-active-org", activeOrgId);
    // Persist on user record (survives cookie clear / device switch)
    fetch("/api/admin/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastActiveOrg: activeOrgId, lastActiveSite: siteId }),
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
  }

  function enterSite(site: SiteEntry) {
    // Navigate first, then notify — prevents Sites page from reloading
    setCookie("cms-active-site", site.id);
    setCookie("cms-active-org", activeOrgId);
    router.push("/admin");
    router.refresh();
    // Fire events after push so header/sidebar update on the new page
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("cms-site-change", { detail: { siteId: site.id } }));
      window.dispatchEvent(new CustomEvent("cms-registry-change"));
      fetch("/api/admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastActiveOrg: activeOrgId, lastActiveSite: site.id }),
      }).catch(() => {});
    }, 50);
  }

  function goToSiteSettings(site: SiteEntry) {
    persistSiteChoice(site.id);
    router.push("/admin/settings");
    router.refresh();
  }

  if (!loaded) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Loading sites...</p>
      </div>
    );
  }

  if (!registry || !activeOrg || activeOrg.sites.length === 0) {
    return (
      <>
      <ActionBar
        actions={
          <ActionButton variant="primary" onClick={() => router.push("/admin/sites/new")} icon={<Plus style={{ width: 14, height: 14 }} />}>
            New site
          </ActionButton>
        }
      >
        <ActionBarBreadcrumb items={["Sites"]} />
      </ActionBar>
      <div style={{ padding: "2rem", maxWidth: "64rem" }}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "4rem 2rem", border: "1px dashed var(--border)", borderRadius: "12px",
          background: "var(--card)", marginTop: "1rem",
        }}>
          <Globe style={{ width: "2.5rem", height: "2.5rem", color: "var(--muted-foreground)", marginBottom: "1rem", opacity: 0.5 }} />
          <p style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.35rem" }}>No sites yet</p>
          <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: "0 0 1.25rem", textAlign: "center", maxWidth: "320px" }}>
            Add your first site to start managing content. Connect a GitHub repo or use a local filesystem.
          </p>
          <button
            type="button"
            onClick={() => router.push("/admin/sites/new")}
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              padding: "0.5rem 1rem", borderRadius: "8px", border: "none",
              background: "var(--primary)", color: "var(--primary-foreground)",
              fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
            }}
          >
            <Plus style={{ width: "0.875rem", height: "0.875rem" }} />
            New site
          </button>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
    <ActionBar
      actions={isAdmin ? (
        <ActionButton variant="primary" onClick={() => router.push("/admin/sites/new")} icon={<Plus style={{ width: 14, height: 14 }} />}>
          New site
        </ActionButton>
      ) : undefined}
    >
      <ActionBarBreadcrumb items={["Sites"]} />
    </ActionBar>
    <div className="p-8 max-w-5xl">

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {[
          { label: `All (${visibleSites.length})`, active: true },
          { label: `Local (${visibleSites.filter(s => s.adapter === "filesystem").length})`, active: false },
          { label: `GitHub (${visibleSites.filter(s => s.adapter === "github").length})`, active: false },
        ].map((f) => (
          <span key={f.label} style={{
            padding: "0.3rem 0.75rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 500,
            cursor: "pointer",
            background: f.active ? "var(--secondary)" : "transparent",
            color: f.active ? "var(--foreground)" : "var(--muted-foreground)",
            border: f.active ? "1px solid var(--border)" : "1px solid transparent",
          }}>{f.label}</span>
        ))}
      </div>

      {/* Site cards grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "1rem",
      }}>
        {visibleSites.map((site) => (
          <div
            key={site.id}
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1.25rem 1.5rem",
              cursor: "pointer",
              transition: "all 0.2s",
              position: "relative",
            }}
            className="hover:border-primary/30 hover:shadow-lg"
            onClick={() => enterSite(site)}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{
                  width: "0.5rem", height: "0.5rem", borderRadius: "50%", flexShrink: 0,
                  background: healthMap[site.id] === "up" ? "rgb(74 222 128)" : healthMap[site.id] === "down" ? "var(--destructive)" : "var(--muted-foreground)",
                }} title={healthMap[site.id] === "up" ? "Running" : healthMap[site.id] === "down" ? "Unreachable" : "No preview"} />
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>{site.name}</h3>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded-md hover:bg-accent transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer"
                >
                  <MoreVertical style={{ width: "0.875rem", height: "0.875rem", color: "var(--muted-foreground)" }} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(site.id); }}>
                    <Copy className="mr-2 h-4 w-4 text-muted-foreground" />
                    Copy site ID
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); goToSiteSettings(site); }}>
                    <Settings2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0 0 0.5rem", fontFamily: "monospace" }}>
              {site.adapter === "github" ? "GitHub" : "Filesystem"}{site.previewUrl ? ` · ${site.previewUrl.replace(/^https?:\/\//, "")}` : ""}
            </p>
            {stats[site.id] && (
              <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0 0 0.75rem" }}>
                Pages: {stats[site.id].pages} · Collections: {stats[site.id].collections}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "0.375rem" }}>
                <span style={{
                  fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.03em",
                  padding: "0.2rem 0.5rem", borderRadius: "4px",
                  background: "color-mix(in srgb, #22c55e 15%, transparent)",
                  color: "#22c55e", textTransform: "uppercase",
                }}>
                  Active
                </span>
                <span style={{
                  fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.03em",
                  padding: "0.2rem 0.5rem", borderRadius: "4px",
                  background: "var(--muted)",
                  color: "var(--muted-foreground)", textTransform: "uppercase",
                }}>
                  {site.adapter === "github" ? "GitHub" : "Local"}
                </span>
              </div>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  persistSiteChoice(site.id);
                  if (site.previewUrl) {
                    openTab(`/admin/preview?url=${encodeURIComponent(site.previewUrl)}`, `Preview: ${site.name}`);
                  } else {
                    const res = await fetch("/api/preview-serve", { method: "POST" });
                    if (res.ok) {
                      const { url } = await res.json() as { url: string };
                      openTab(`/admin/preview?url=${encodeURIComponent(url)}`, `Preview: ${site.name}`);
                    }
                  }
                }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.375rem",
                  fontSize: "0.75rem", fontWeight: 500,
                  padding: "0.3rem 0.75rem", borderRadius: "6px",
                  background: "transparent",
                  color: "var(--muted-foreground)",
                  border: "1px solid var(--border)", cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted-foreground)"; }}
              >
                <Eye style={{ width: "0.8rem", height: "0.8rem" }} />
                Preview
              </button>
              {liveUrls[site.id] && (
                <a
                  href={liveUrls[site.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "0.375rem",
                    fontSize: "0.75rem", fontWeight: 500,
                    padding: "0.3rem 0.75rem", borderRadius: "6px",
                    background: "transparent",
                    color: "var(--muted-foreground)",
                    border: "1px solid var(--border)", cursor: "pointer",
                    transition: "all 0.2s", textDecoration: "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgb(74 222 128)"; e.currentTarget.style.color = "rgb(74 222 128)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted-foreground)"; }}
                >
                  <ExternalLink style={{ width: "0.8rem", height: "0.8rem" }} />
                  Live
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
    </>
  );
}
