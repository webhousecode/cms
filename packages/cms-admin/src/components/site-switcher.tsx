"use client";

import { useEffect, useState } from "react";
import { Building2, Globe, Check, Plus, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

export function SiteSwitcher() {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [mode, setMode] = useState<"single-site" | "multi-site">("single-site");
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [activeSiteId, setActiveSiteId] = useState<string>("");

  useEffect(() => {
    fetch("/api/cms/registry")
      .then((r) => r.json())
      .then((d: { mode: string; registry: Registry | null }) => {
        setMode(d.mode as "single-site" | "multi-site");
        if (d.registry) {
          setRegistry(d.registry);
          setActiveOrgId(getCookie("cms-active-org") ?? d.registry.defaultOrgId);
          setActiveSiteId(getCookie("cms-active-site") ?? d.registry.defaultSiteId);
        }
      })
      .catch(() => {});
  }, []);

  // Single-site mode — don't render anything
  if (mode === "single-site" || !registry) return null;

  const activeOrg = registry.orgs.find((o) => o.id === activeOrgId) ?? registry.orgs[0];
  const activeSite = activeOrg?.sites.find((s) => s.id === activeSiteId) ?? activeOrg?.sites[0];

  function switchOrg(orgId: string) {
    const org = registry!.orgs.find((o) => o.id === orgId);
    if (!org) return;
    const firstSite = org.sites[0];
    setCookie("cms-active-org", orgId);
    setCookie("cms-active-site", firstSite?.id ?? "");
    window.location.reload();
  }

  function switchSite(siteId: string) {
    setCookie("cms-active-site", siteId);
    window.location.reload();
  }

  async function bootstrapRegistry() {
    await fetch("/api/cms/registry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bootstrap" }),
    });
    window.location.reload();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
      {/* Org switcher */}
      {registry.orgs.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer p-0"
          >
            <Building2 style={{ width: "0.875rem", height: "0.875rem" }} />
            <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{activeOrg?.name}</span>
            <ChevronDown style={{ width: "0.7rem", height: "0.7rem", opacity: 0.5 }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" style={{ minWidth: "180px" }}>
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Organizations</DropdownMenuLabel>
            {registry.orgs.map((org) => (
              <DropdownMenuItem key={org.id} onClick={() => switchOrg(org.id)}>
                <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                {org.name}
                {org.id === activeOrgId && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Separator */}
      {registry.orgs.length > 1 && (
        <div style={{ width: "1px", height: "1rem", backgroundColor: "var(--border)", margin: "0 0.25rem" }} />
      )}

      {/* Site switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-1 text-sm text-foreground hover:text-muted-foreground transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer p-0"
        >
          <Globe style={{ width: "0.875rem", height: "0.875rem", color: "var(--muted-foreground)" }} />
          <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{activeSite?.name}</span>
          <ChevronDown style={{ width: "0.7rem", height: "0.7rem", opacity: 0.5 }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" style={{ minWidth: "200px" }}>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {activeOrg?.name} sites
          </DropdownMenuLabel>
          {activeOrg?.sites.map((site) => (
            <DropdownMenuItem key={site.id} onClick={() => switchSite(site.id)}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                <span style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  backgroundColor: site.id === activeSiteId ? "#22c55e" : "var(--muted-foreground)",
                  flexShrink: 0,
                }} />
                {site.name}
                {site.adapter === "github" && (
                  <span style={{
                    fontSize: "0.6rem", color: "var(--muted-foreground)",
                    backgroundColor: "var(--muted)", padding: "1px 5px",
                    borderRadius: "3px", marginLeft: "auto",
                  }}>GH</span>
                )}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-muted-foreground text-xs">
            <Plus className="mr-2 h-3 w-3" />
            Add site
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Bootstrap button — shown in settings when in single-site mode */
export function EnableMultiSiteButton() {
  const [mode, setMode] = useState<string>("loading");

  useEffect(() => {
    fetch("/api/cms/registry")
      .then((r) => r.json())
      .then((d: { mode: string }) => setMode(d.mode))
      .catch(() => setMode("single-site"));
  }, []);

  if (mode !== "single-site") return null;

  async function enable() {
    await fetch("/api/cms/registry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bootstrap" }),
    });
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={enable}
      style={{
        padding: "0.5rem 1rem",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: "var(--card)",
        color: "var(--foreground)",
        fontSize: "0.8rem",
        cursor: "pointer",
      }}
    >
      Enable multi-site management
    </button>
  );
}
