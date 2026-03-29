"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Check, Plus, LayoutGrid, Globe } from "lucide-react";
import { switchSite, switchOrg } from "@/lib/switch-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function HealthDot({ status }: { status?: "up" | "down" | "no-preview" }) {
  const color = status === "up" ? "rgb(74 222 128)" : status === "down" ? "var(--destructive)" : "var(--muted-foreground)";
  const title = status === "up" ? "Running" : status === "down" ? "Unreachable" : status === "no-preview" ? "No preview URL" : "Checking...";
  return (
    <span style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", flexShrink: 0, background: color, marginRight: "0.5rem" }} title={title} />
  );
}

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
  const [healthMap, setHealthMap] = useState<Record<string, "up" | "down" | "no-preview">>({});

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
          const orgId = getCookie("cms-active-org") ?? d.registry.defaultOrgId;
          const sId = getCookie("cms-active-site") ?? d.registry.defaultSiteId;
          setActiveOrgId(orgId);
          setActiveSiteId(sId);
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

  // Check preview site health for all sites in org
  useEffect(() => {
    setHealthMap({});
    fetch("/api/admin/site-health?all=true")
      .then((r) => r.ok ? r.json() : { sites: {} })
      .then((d: { sites: Record<string, "up" | "down" | "no-preview"> }) => {
        setHealthMap(d.sites ?? {});
      })
      .catch(() => {});
  }, [activeSiteId]);

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
    if (site.id === activeSiteId) return;
    switchSite(site.id, activeOrgId);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger data-testid="site-switcher" className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accent transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer">
        <HealthDot status={healthMap[activeSiteId]} />
        <span className="max-w-[140px] truncate">{activeSite?.name ?? "Select site"}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {sites.map((site) => (
          <DropdownMenuItem key={site.id} onClick={() => handleSelect(site)}>
            <HealthDot status={healthMap[site.id]} />
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

  function handleSelect(org: OrgEntry) {
    if (org.id === activeOrgId) return;
    switchOrg(org.id, org.sites[0]?.id ?? null, org.sites.length);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger data-testid="org-switcher" className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-accent transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer">
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
        <DropdownMenuItem onClick={() => router.push("/admin/organizations/new")}>
          <Plus className="mr-2 h-4 w-4" />
          New organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
