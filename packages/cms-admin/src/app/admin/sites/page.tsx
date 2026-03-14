"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, MoreVertical, Settings2, Plus, Copy } from "lucide-react";
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
  const [stats, setStats] = useState<Record<string, { collections: number; documents: number; published: number }>>({});

  useEffect(() => {
    fetch("/api/cms/registry")
      .then((r) => r.json())
      .then((d: { mode: string; registry: Registry | null }) => {
        if (d.registry) {
          setRegistry(d.registry);
          setActiveOrgId(getCookie("cms-active-org") ?? d.registry.defaultOrgId);
        }
      });
  }, []);

  const activeOrg = registry?.orgs.find((o) => o.id === activeOrgId) ?? registry?.orgs[0];

  function enterSite(site: SiteEntry) {
    setCookie("cms-active-site", site.id);
    setCookie("cms-active-org", activeOrgId);
    router.push("/admin");
    router.refresh();
  }

  function goToSiteSettings(site: SiteEntry) {
    setCookie("cms-active-site", site.id);
    setCookie("cms-active-org", activeOrgId);
    router.push("/admin/settings");
    router.refresh();
  }

  if (!registry || !activeOrg) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Loading sites...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "3rem 2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 0.25rem" }}>Sites</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", margin: 0 }}>
            {activeOrg.sites.length} site{activeOrg.sites.length !== 1 ? "s" : ""} in {activeOrg.name}
          </p>
        </div>
        <button
          type="button"
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

      {/* Site cards grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "1rem",
      }}>
        {activeOrg.sites.map((site) => (
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
            {/* Top row: name + more button */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Globe style={{ width: "1rem", height: "1rem", color: "var(--muted-foreground)" }} />
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>{site.name}</h3>
              </div>

              {/* More menu */}
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

            {/* Adapter badge */}
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0 0 0.75rem", fontFamily: "monospace" }}>
              {site.adapter === "github" ? "GitHub" : "Filesystem"}{site.previewUrl ? ` · ${site.previewUrl.replace(/^https?:\/\//, "")}` : ""}
            </p>

            {/* Status badges */}
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
          </div>
        ))}
      </div>
    </div>
  );
}
