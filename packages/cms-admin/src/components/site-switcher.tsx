"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Check, Plus, LayoutGrid, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SiteEntry {
  id: string;
  name: string;
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

export function SiteSwitcher() {
  const router = useRouter();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [activeSiteId, setActiveSiteId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [siteRole, setSiteRole] = useState<string | null>(null);
  const [allowedSiteIds, setAllowedSiteIds] = useState<string[] | null>(null);

  const fetchRegistry = useCallback(async () => {
    try {
      const [regRes, sitesRes] = await Promise.all([
        fetch("/api/cms/registry"),
        fetch("/api/admin/my-sites"),
      ]);
      if (regRes.ok) {
        const d = await regRes.json() as { mode: string; registry: Registry | null };
        if (d.registry) {
          setRegistry(d.registry);
          setActiveOrgId(getCookie("cms-active-org") ?? d.registry.defaultOrgId);
          setActiveSiteId(getCookie("cms-active-site") ?? d.registry.defaultSiteId);
        }
      }
      if (sitesRes.ok) {
        const d = await sitesRes.json() as { siteIds: string[] };
        setAllowedSiteIds(d.siteIds);
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { fetchRegistry(); }, [fetchRegistry]);

  // Fetch site role (re-fetch when active site changes)
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { siteRole?: string } }) => setSiteRole(d.user?.siteRole ?? null))
      .catch(() => {});
  }, [activeSiteId]);

  useEffect(() => {
    function handleChange() { fetchRegistry(); }
    window.addEventListener("cms-registry-change", handleChange);
    return () => window.removeEventListener("cms-registry-change", handleChange);
  }, [fetchRegistry]);

  if (!loaded || !registry) return null;

  const activeOrg = registry.orgs.find((o) => o.id === activeOrgId) ?? registry.orgs[0];
  const allSites = activeOrg?.sites ?? [];
  // Filter to only sites the user has team membership on
  const sites = allowedSiteIds
    ? allSites.filter((s) => allowedSiteIds.includes(s.id))
    : allSites;
  const activeSite = allSites.find((s) => s.id === activeSiteId) ?? sites[0];
  const isAdmin = siteRole === "admin";

  // Don't show if only one site (or none)
  if (sites.length <= 1) return null;

  function handleSelect(site: SiteEntry) {
    setActiveSiteId(site.id);
    setCookie("cms-active-site", site.id);
    // Persist last active site on user record (survives cookie clear / device switch)
    fetch("/api/admin/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastActiveOrg: activeOrgId, lastActiveSite: site.id }),
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
    router.push("/admin");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accent transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[140px] truncate">{activeSite?.name ?? "Select site"}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {sites.map((site) => (
          <DropdownMenuItem key={site.id} onClick={() => handleSelect(site)}>
            <Globe className="mr-2 h-4 w-4 text-muted-foreground" />
            <span className="truncate">{site.name}</span>
            {site.id === activeSiteId && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-muted-foreground" onClick={() => { router.push("/admin/sites"); }}>
              <LayoutGrid className="mr-2 h-4 w-4" />
              All sites
            </DropdownMenuItem>
            <DropdownMenuItem className="text-muted-foreground" onClick={() => { router.push("/admin/sites/new"); }}>
              <Plus className="mr-2 h-4 w-4" />
              New site
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OrgSwitcher() {
  const router = useRouter();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await fetch("/api/cms/registry");
      if (res.ok) {
        const d = await res.json() as { mode: string; registry: Registry | null };
        if (d.registry) {
          setRegistry(d.registry);
          const cookieOrg = getCookie("cms-active-org");
          const orgId = cookieOrg || d.registry.defaultOrgId;
          setActiveOrgId(orgId);
          if (!cookieOrg && orgId) {
            setCookie("cms-active-org", orgId);
          }
        }
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { fetchRegistry(); }, [fetchRegistry]);

  useEffect(() => {
    function handleChange() { fetchRegistry(); }
    window.addEventListener("cms-registry-change", handleChange);
    return () => window.removeEventListener("cms-registry-change", handleChange);
  }, [fetchRegistry]);

  if (!loaded || !registry) return null;

  const activeOrg = registry.orgs.find((o) => o.id === activeOrgId) ?? registry.orgs[0];

  async function createOrg() {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const res = await fetch("/api/cms/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-org", orgName: newOrgName.trim() }),
      });
      if (res.ok) {
        const { org } = await res.json() as { org: OrgEntry };
        setCookie("cms-active-org", org.id);
        document.cookie = "cms-active-site=;path=/;max-age=0";
        window.dispatchEvent(new CustomEvent("cms-registry-change"));
        setShowNewOrg(false);
        setNewOrgName("");
        router.push("/admin/sites/new");
        router.refresh();
      }
    } finally {
      setCreatingOrg(false);
    }
  }

  function handleSelect(org: OrgEntry) {
    setActiveOrgId(org.id);
    setCookie("cms-active-org", org.id);
    // Clear site cookie when switching orgs
    document.cookie = "cms-active-site=;path=/;max-age=0";
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
    router.push("/admin");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accent transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[120px] truncate">{activeOrg?.name ?? "Select org"}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {registry.orgs.map((org) => (
          <DropdownMenuItem key={org.id} onClick={() => handleSelect(org)}>
            <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
            <span className="truncate">{org.name}</span>
            {org.id === activeOrgId && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/admin/organizations")}>
          <LayoutGrid className="mr-2 h-4 w-4" />
          All organizations
        </DropdownMenuItem>
        {showNewOrg ? (
          <div style={{ padding: "0.5rem 0.5rem 0.25rem" }} onClick={(e) => e.stopPropagation()}>
            <label style={{ fontSize: "0.7rem", fontWeight: 500, color: "var(--muted-foreground)", display: "block", marginBottom: "0.25rem" }}>
              Organization name
            </label>
            <input
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createOrg(); if (e.key === "Escape") { setShowNewOrg(false); setNewOrgName(""); } }}
              placeholder="Client Name"
              autoFocus
              style={{
                width: "100%", padding: "0.35rem 0.5rem", borderRadius: "6px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
                marginBottom: "0.35rem",
              }}
            />
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <button
                type="button"
                onClick={createOrg}
                disabled={creatingOrg || !newOrgName.trim()}
                style={{
                  flex: 1, padding: "0.3rem 0.5rem", borderRadius: "6px", border: "none",
                  background: "var(--primary)", color: "var(--primary-foreground)",
                  fontSize: "0.75rem", fontWeight: 500, cursor: creatingOrg ? "wait" : "pointer",
                  opacity: !newOrgName.trim() ? 0.5 : 1,
                }}
              >
                {creatingOrg ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => { setShowNewOrg(false); setNewOrgName(""); }}
                style={{
                  padding: "0.3rem 0.5rem", borderRadius: "6px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowNewOrg(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New organization
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
