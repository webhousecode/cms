"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Globe, MoreVertical, Settings2, Plus, Copy, X, Github, HardDrive } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SiteGitHub {
  owner: string;
  repo: string;
  branch?: string;
  contentDir?: string;
  token: string;
}

interface SiteEntry {
  id: string;
  name: string;
  adapter: "filesystem" | "github";
  configPath: string;
  contentDir?: string;
  uploadDir?: string;
  previewUrl?: string;
  github?: SiteGitHub;
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

/* ─── New Site Dialog ──────────────────────────────────────── */

function NewSiteDialog({ orgId, onClose, onCreated }: {
  orgId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [adapter, setAdapter] = useState<"github" | "filesystem">("github");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [contentDir, setContentDir] = useState("content");
  const [tokenEnvVar, setTokenEnvVar] = useState("");
  const [configPath, setConfigPath] = useState("");
  const [fsContentDir, setFsContentDir] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  function siteId(): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-site";
  }

  async function handleCreate() {
    setError("");
    const id = siteId();
    if (!name.trim()) { setError("Site name is required"); return; }

    const site: SiteEntry = { id, name: name.trim(), adapter, configPath: "", previewUrl: previewUrl || undefined };

    if (adapter === "github") {
      if (!owner.trim() || !repo.trim()) { setError("Owner and repo are required"); return; }
      if (!tokenEnvVar.trim()) { setError("Token env var is required"); return; }
      site.configPath = `github://${owner}/${repo}/cms.config.ts`;
      site.github = {
        owner: owner.trim(),
        repo: repo.trim(),
        branch: branch || "main",
        contentDir: contentDir || "content",
        token: `env:${tokenEnvVar.trim()}`,
      };
    } else {
      if (!configPath.trim()) { setError("Config path is required"); return; }
      site.configPath = configPath.trim();
      site.contentDir = fsContentDir.trim() || undefined;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/cms/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-site", orgId, site }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${res.status})`);
      }
      window.dispatchEvent(new CustomEvent("cms-registry-change"));
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create site");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px",
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", fontSize: "0.875rem",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem",
    color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em",
  };

  return (
    <div
      ref={overlayRef}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: "12px", width: "min(520px, 90vw)", maxHeight: "85vh",
        overflow: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>New Site</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "4px" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Adapter picker */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {([
              { value: "github" as const, label: "GitHub", icon: Github },
              { value: "filesystem" as const, label: "Filesystem", icon: HardDrive },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setAdapter(value)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  padding: "0.6rem 1rem", borderRadius: "8px", cursor: "pointer",
                  border: adapter === value ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: adapter === value ? "var(--accent)" : "transparent",
                  color: adapter === value ? "var(--foreground)" : "var(--muted-foreground)",
                  fontSize: "0.85rem", fontWeight: 500,
                }}
              >
                <Icon style={{ width: 16, height: 16 }} /> {label}
              </button>
            ))}
          </div>

          {/* Site name */}
          <div>
            <label style={labelStyle}>Site Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Site" style={inputStyle} />
            {name && <p style={{ margin: "0.25rem 0 0", fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>ID: {siteId()}</p>}
          </div>

          {adapter === "github" ? (
            <>
              {/* Owner + Repo */}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Owner</label>
                  <input type="text" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="webhousecode" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Repository</label>
                  <input type="text" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="my-site" style={inputStyle} />
                </div>
              </div>
              {/* Branch + Content dir */}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Branch</label>
                  <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Content Directory</label>
                  <input type="text" value={contentDir} onChange={(e) => setContentDir(e.target.value)} placeholder="content" style={inputStyle} />
                </div>
              </div>
              {/* Token env var */}
              <div>
                <label style={labelStyle}>GitHub Token (env variable name)</label>
                <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
                  <span style={{ padding: "0.5rem 0.6rem", borderRadius: "6px 0 0 6px", border: "1px solid var(--border)", borderRight: "none", background: "var(--muted)", color: "var(--muted-foreground)", fontSize: "0.8rem", fontFamily: "monospace", whiteSpace: "nowrap" }}>env:</span>
                  <input type="text" value={tokenEnvVar} onChange={(e) => setTokenEnvVar(e.target.value)} placeholder="GITHUB_TOKEN_MY_SITE" style={{ ...inputStyle, borderRadius: "0 6px 6px 0" }} />
                </div>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                  The env var must be set on the server where CMS admin runs
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Filesystem: config path + content dir */}
              <div>
                <label style={labelStyle}>Config Path (absolute)</label>
                <input type="text" value={configPath} onChange={(e) => setConfigPath(e.target.value)} placeholder="/Users/.../cms.config.ts" style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.8rem" }} />
              </div>
              <div>
                <label style={labelStyle}>Content Directory (absolute, optional)</label>
                <input type="text" value={fsContentDir} onChange={(e) => setFsContentDir(e.target.value)} placeholder="/Users/.../content" style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.8rem" }} />
              </div>
            </>
          )}

          {/* Preview URL (both) */}
          <div>
            <label style={labelStyle}>Preview URL (optional)</label>
            <input type="url" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://my-site.example.com" style={inputStyle} />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--destructive)", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "color-mix(in srgb, var(--destructive) 10%, transparent)" }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", padding: "1rem 1.5rem", borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={onClose} style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontSize: "0.85rem", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            style={{
              padding: "0.5rem 1.25rem", borderRadius: "8px", border: "none",
              background: "var(--primary)", color: "var(--primary-foreground)",
              fontSize: "0.85rem", fontWeight: 600, cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Creating..." : "Create Site"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SitesDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [stats, setStats] = useState<Record<string, { pages: number; collections: number }>>({});
  const [showNewSite, setShowNewSite] = useState(searchParams.get("new") === "1");

  function fetchSites() {
    fetch("/api/cms/registry")
      .then((r) => r.json())
      .then((d: { mode: string; registry: Registry | null }) => {
        if (d.registry) {
          setRegistry(d.registry);
          const orgId = getCookie("cms-active-org") ?? d.registry.defaultOrgId;
          setActiveOrgId(orgId);

          // Fetch stats for each site
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
      });
  }

  useEffect(() => { fetchSites(); }, []);

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
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Sites</p>
          <h1 className="text-2xl font-bold text-foreground">Sites</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowNewSite(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            padding: "0.5rem 1rem", borderRadius: "8px", border: "none",
            background: "var(--primary)", color: "var(--primary-foreground)",
            fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus style={{ width: "0.875rem", height: "0.875rem" }} />
          New Site
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {[
          { label: `All (${activeOrg.sites.length})`, active: true },
          { label: `Local (${activeOrg.sites.filter(s => s.adapter === "filesystem").length})`, active: false },
          { label: `GitHub (${activeOrg.sites.filter(s => s.adapter === "github").length})`, active: false },
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

            {/* Site info */}
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0 0 0.5rem", fontFamily: "monospace" }}>
              {site.adapter === "github" ? "GitHub" : "Filesystem"}{site.previewUrl ? ` · ${site.previewUrl.replace(/^https?:\/\//, "")}` : ""}
            </p>
            {stats[site.id] && (
              <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0 0 0.75rem" }}>
                Pages: {stats[site.id].pages} · Collections: {stats[site.id].collections}
              </p>
            )}

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

      {showNewSite && (
        <NewSiteDialog
          orgId={activeOrgId}
          onClose={() => setShowNewSite(false)}
          onCreated={() => { setShowNewSite(false); fetchSites(); }}
        />
      )}
    </div>
  );
}
