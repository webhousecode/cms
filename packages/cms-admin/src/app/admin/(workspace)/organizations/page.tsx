"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Search, MoreVertical, Settings2, Trash2 } from "lucide-react";
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
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

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
    setCookie("cms-active-org", org.id);
    document.cookie = "cms-active-site=;path=/;max-age=0";
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
    if (org.sites.length > 0) {
      setCookie("cms-active-site", org.sites[0].id);
      router.push("/admin");
    } else {
      router.push("/admin/sites/new");
    }
    router.refresh();
  }

  async function createOrg() {
    if (!newOrgName.trim()) return;
    setCreating(true);
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
        // Refetch registry
        const regRes = await fetch("/api/cms/registry");
        const regData = await regRes.json() as { registry: Registry | null };
        if (regData.registry) setRegistry(regData.registry);
        setActiveOrgId(org.id);
        window.dispatchEvent(new CustomEvent("cms-registry-change"));
        setShowNewOrg(false);
        setNewOrgName("");
      }
    } finally {
      setCreating(false);
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
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Organizations</p>
        <h1 className="text-2xl font-bold text-foreground">Your Organizations</h1>
      </div>

      {/* Search + New org */}
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
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowNewOrg(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            padding: "0.45rem 1rem", borderRadius: "8px", border: "none",
            background: "var(--primary)", color: "var(--primary-foreground)",
            fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus style={{ width: "0.875rem", height: "0.875rem" }} />
          New organization
        </button>
      </div>

      {/* New org inline form */}
      {showNewOrg && (
        <div style={{
          padding: "1rem", borderRadius: "10px", border: "1px solid var(--primary)",
          background: "var(--card)", marginBottom: "1rem",
          display: "flex", alignItems: "flex-end", gap: "0.75rem",
        }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--muted-foreground)", display: "block", marginBottom: "0.25rem" }}>
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
                width: "100%", padding: "0.45rem 0.6rem", borderRadius: "6px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.85rem", outline: "none",
              }}
            />
          </div>
          <button
            type="button"
            onClick={createOrg}
            disabled={creating || !newOrgName.trim()}
            style={{
              padding: "0.45rem 1rem", borderRadius: "6px", border: "none",
              background: "var(--primary)", color: "var(--primary-foreground)",
              fontSize: "0.8rem", fontWeight: 600, cursor: creating ? "wait" : "pointer",
              opacity: !newOrgName.trim() ? 0.5 : 1,
            }}
          >
            {creating ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={() => { setShowNewOrg(false); setNewOrgName(""); }}
            style={{
              padding: "0.45rem 0.75rem", borderRadius: "6px",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--muted-foreground)", fontSize: "0.8rem", cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}

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
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); switchToOrg(org); router.push("/admin/settings"); }}>
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
  );
}
