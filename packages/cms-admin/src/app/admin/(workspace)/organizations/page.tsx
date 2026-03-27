"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Search, MoreVertical, Settings2, Trash2 } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import { switchOrg, switchToNewOrg } from "@/lib/switch-context";
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

export default function OrganizationsPage() {
  const router = useRouter();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  // New org

  useEffect(() => {
    fetch("/api/cms/registry")
      .then((r) => r.json())
      .then((d: { registry: Registry | null }) => {
        if (d.registry) {
          setRegistry(d.registry);
          setActiveOrgId(getCookie("cms-active-org") ?? d.registry.defaultOrgId);
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  function switchToOrg(org: OrgEntry) {
    if (org.sites.length === 0) {
      switchToNewOrg(org.id);
    } else {
      switchOrg(org.id, org.sites[0].id, org.sites.length);
    }
  }

  if (!loaded) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Loading organizations...</p>
      </div>
    );
  }

  const orgs = registry?.orgs ?? [];
  const filtered = search
    ? orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : orgs;

  return (
    <>
    <ActionBar
      actions={
        <ActionButton variant="primary" onClick={() => router.push("/admin/organizations/new")} icon={<Plus style={{ width: 14, height: 14 }} />}>
          New organization
        </ActionButton>
      }
    >
      <ActionBarBreadcrumb items={["Organizations"]} />
    </ActionBar>
    <div className="p-8 max-w-5xl">
      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: "280px" }}>
          <Search style={{ position: "absolute", left: "0.6rem", top: "50%", transform: "translateY(-50%)", width: "0.875rem", height: "0.875rem", color: "var(--muted-foreground)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for an organization"
            style={{
              width: "100%", padding: "0.45rem 0.6rem 0.45rem 2rem", borderRadius: "6px",
              border: "1px solid var(--border)", background: "var(--background)",
              color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
            }}
          />
        </div>
      </div>

      {/* Org cards grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: "1rem",
      }}>
        {filtered.map((org) => (
          <div
            key={org.id}
            onClick={() => switchToOrg(org)}
            style={{
              background: "var(--card)",
              border: org.id === activeOrgId ? "2px solid var(--primary)" : "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1.25rem 1.5rem",
              cursor: "pointer",
              transition: "all 0.2s",
              position: "relative",
            }}
            className="hover:border-primary/50 hover:shadow-lg"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.35rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <Building2 style={{ width: "1.25rem", height: "1.25rem", color: "var(--muted-foreground)" }} />
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>{org.name}</h3>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded-md hover:bg-accent transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer"
                >
                  <MoreVertical style={{ width: "0.875rem", height: "0.875rem", color: "var(--muted-foreground)" }} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); switchToOrg(org); router.push("/admin/organizations/settings"); }}>
                    <Settings2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
              {org.sites.length} site{org.sites.length !== 1 ? "s" : ""}
              {org.id === activeOrgId && (
                <span style={{
                  marginLeft: "0.5rem", fontSize: "0.65rem", fontWeight: 600,
                  padding: "0.15rem 0.4rem", borderRadius: "4px",
                  background: "color-mix(in srgb, #22c55e 15%, transparent)",
                  color: "#22c55e", textTransform: "uppercase",
                }}>
                  Active
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      {filtered.length === 0 && search && (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted-foreground)", fontSize: "0.85rem" }}>
          No organizations matching &ldquo;{search}&rdquo;
        </div>
      )}
    </div>
    </>
  );
}
