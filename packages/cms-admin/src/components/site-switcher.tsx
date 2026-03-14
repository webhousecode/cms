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
  adapter: "filesystem" | "github";
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
  const [mode, setMode] = useState<"single-site" | "multi-site">("single-site");
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [activeSiteId, setActiveSiteId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await fetch("/api/cms/registry");
      if (res.ok) {
        const d = await res.json() as { mode: string; registry: Registry | null };
        setMode(d.mode as "single-site" | "multi-site");
        if (d.registry) {
          setRegistry(d.registry);
          setActiveOrgId(getCookie("cms-active-org") ?? d.registry.defaultOrgId);
          setActiveSiteId(getCookie("cms-active-site") ?? d.registry.defaultSiteId);
        }
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchRegistry();
  }, [fetchRegistry]);

  useEffect(() => {
    function handleChange() { fetchRegistry(); }
    window.addEventListener("cms-registry-change", handleChange);
    return () => window.removeEventListener("cms-registry-change", handleChange);
  }, [fetchRegistry]);

  // Single-site mode or loading — don't render
  if (!loaded || mode === "single-site" || !registry) return null;

  const activeOrg = registry.orgs.find((o) => o.id === activeOrgId) ?? registry.orgs[0];
  const activeSite = activeOrg?.sites.find((s) => s.id === activeSiteId) ?? activeOrg?.sites[0];

  function handleSelectOrg(org: OrgEntry) {
    const firstSite = org.sites[0];
    setActiveOrgId(org.id);
    setActiveSiteId(firstSite?.id ?? "");
    setCookie("cms-active-org", org.id);
    setCookie("cms-active-site", firstSite?.id ?? "");
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
    router.push("/admin");
    router.refresh();
  }

  function handleSelectSite(site: SiteEntry) {
    setActiveSiteId(site.id);
    setCookie("cms-active-site", site.id);
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
    router.push("/admin");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
      {/* Org switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="max-w-[120px] truncate">{activeOrg?.name ?? "Select org"}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {registry.orgs.map((org) => (
            <DropdownMenuItem key={org.id} onClick={() => handleSelectOrg(org)}>
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="truncate">{org.name}</span>
              {org.id === activeOrgId && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-muted-foreground">
            <LayoutGrid className="mr-2 h-4 w-4" />
            All organizations
          </DropdownMenuItem>
          <DropdownMenuItem className="text-muted-foreground">
            <Plus className="mr-2 h-4 w-4" />
            New organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Site switcher — only if org has multiple sites */}
      {activeOrg && activeOrg.sites.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 text-sm font-medium">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="max-w-[140px] truncate">{activeSite?.name ?? "Select site"}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {activeOrg.sites.map((site) => (
              <DropdownMenuItem key={site.id} onClick={() => handleSelectSite(site)}>
                <Globe className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="truncate">{site.name}</span>
                {site.adapter === "github" && (
                  <span style={{
                    fontSize: "0.6rem", color: "var(--muted-foreground)",
                    backgroundColor: "var(--muted)", padding: "1px 5px",
                    borderRadius: "3px", marginLeft: "0.25rem",
                  }}>GH</span>
                )}
                {site.id === activeSiteId && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-muted-foreground">
              <Plus className="mr-2 h-4 w-4" />
              Add site
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
