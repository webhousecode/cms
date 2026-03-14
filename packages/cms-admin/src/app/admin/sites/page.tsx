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
import { CustomSelect } from "@/components/ui/custom-select";

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

/* ─── GitHub types ─────────────────────────────────────────── */

interface GitHubAccount { login: string; avatar: string; type: "user" | "org" }
interface GitHubRepo { name: string; fullName: string; private: boolean; description: string | null; defaultBranch: string }

/* ─── New Site Dialog ──────────────────────────────────────── */

function NewSiteDialog({ orgId, onClose, onCreated }: {
  orgId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [adapter, setAdapter] = useState<"github" | "filesystem">("github");
  const [name, setName] = useState("");
  // GitHub OAuth state
  const [ghConnected, setGhConnected] = useState(false);
  const [ghUser, setGhUser] = useState<string>("");
  const [ghAccounts, setGhAccounts] = useState<GitHubAccount[]>([]);
  const [ghSelectedAccount, setGhSelectedAccount] = useState("");
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [ghSelectedRepo, setGhSelectedRepo] = useState("");
  const [ghLoadingRepos, setGhLoadingRepos] = useState(false);
  const [branch, setBranch] = useState("main");
  const [contentDir, setContentDir] = useState("content");
  // Filesystem state
  const [configPath, setConfigPath] = useState("");
  const [fsContentDir, setFsContentDir] = useState("");
  // Shared state
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  // Check GitHub connection status on mount
  useEffect(() => {
    fetch("/api/github?action=status")
      .then((r) => r.json())
      .then((d: { connected: boolean; user?: { login: string } }) => {
        if (d.connected && d.user) {
          setGhConnected(true);
          setGhUser(d.user.login);
          // Fetch accounts
          fetch("/api/github?action=orgs")
            .then((r) => r.json())
            .then((o: { accounts?: GitHubAccount[] }) => {
              if (o.accounts) {
                setGhAccounts(o.accounts);
                if (o.accounts.length > 0) setGhSelectedAccount(o.accounts[0].login);
              }
            });
        }
      });
  }, []);

  // Fetch repos when account changes
  useEffect(() => {
    if (!ghSelectedAccount || !ghConnected) return;
    setGhLoadingRepos(true);
    setGhRepos([]);
    setGhSelectedRepo("");
    fetch(`/api/github?action=repos&org=${ghSelectedAccount}`)
      .then((r) => r.json())
      .then((d: { repos?: GitHubRepo[] }) => {
        if (d.repos) setGhRepos(d.repos);
      })
      .finally(() => setGhLoadingRepos(false));
  }, [ghSelectedAccount, ghConnected]);

  // Auto-fill name + branch when repo is selected
  useEffect(() => {
    if (!ghSelectedRepo) return;
    const repo = ghRepos.find((r) => r.name === ghSelectedRepo);
    if (repo) {
      if (!name) setName(repo.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      setBranch(repo.defaultBranch);
    }
  }, [ghSelectedRepo, ghRepos, name]);

  function siteId(): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-site";
  }

  async function handleCreate() {
    setError("");
    const id = siteId();
    if (!name.trim()) { setError("Site name is required"); return; }

    const site: SiteEntry = { id, name: name.trim(), adapter, configPath: "", previewUrl: previewUrl || undefined };

    if (adapter === "github") {
      if (!ghSelectedAccount || !ghSelectedRepo) { setError("Select a GitHub account and repository"); return; }
      site.configPath = `github://${ghSelectedAccount}/${ghSelectedRepo}/cms.config.ts`;
      site.github = {
        owner: ghSelectedAccount,
        repo: ghSelectedRepo,
        branch: branch || "main",
        contentDir: contentDir || "content",
        token: "oauth",
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

  function connectGitHub() {
    // Open OAuth flow in same window — callback will redirect back
    window.location.href = "/api/auth/github";
  }

  async function disconnectGitHub() {
    await fetch("/api/github", { method: "DELETE" });
    setGhConnected(false);
    setGhUser("");
    setGhAccounts([]);
    setGhRepos([]);
    setGhSelectedAccount("");
    setGhSelectedRepo("");
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

          {adapter === "github" ? (
            <>
              {/* GitHub connection status */}
              {!ghConnected ? (
                <button
                  type="button"
                  onClick={connectGitHub}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                    padding: "0.75rem 1rem", borderRadius: "8px", cursor: "pointer",
                    border: "1px solid var(--border)", background: "var(--background)",
                    color: "var(--foreground)", fontSize: "0.875rem", fontWeight: 500,
                  }}
                  className="hover:bg-accent transition-colors"
                >
                  <Github style={{ width: 18, height: 18 }} />
                  Connect GitHub
                </button>
              ) : (
                <>
                  {/* Connected badge */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0.5rem 0.75rem", borderRadius: "8px",
                    background: "color-mix(in srgb, #22c55e 10%, transparent)",
                    border: "1px solid color-mix(in srgb, #22c55e 25%, transparent)",
                  }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
                      <Github style={{ width: 16, height: 16 }} />
                      Connected as <strong>{ghUser}</strong>
                    </span>
                    <span style={{ display: "flex", gap: "0.75rem" }}>
                      <a href={`https://github.com/settings/connections/applications/${process.env.NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID ?? ""}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--muted-foreground)", fontSize: "0.75rem", textDecoration: "underline", cursor: "pointer" }}>
                        Manage access
                      </a>
                      <button type="button" onClick={disconnectGitHub} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.75rem", textDecoration: "underline" }}>
                        Disconnect
                      </button>
                    </span>
                  </div>

                  {/* Account picker */}
                  <div>
                    <label style={labelStyle}>Account / Organization</label>
                    <CustomSelect
                      options={ghAccounts.map((a) => ({
                        value: a.login,
                        label: `${a.login} ${a.type === "org" ? "(org)" : "(personal)"}`,
                      }))}
                      value={ghSelectedAccount}
                      onChange={(v) => setGhSelectedAccount(v)}
                    />
                  </div>

                  {/* Repo picker */}
                  <div>
                    <label style={labelStyle}>Repository</label>
                    {ghLoadingRepos ? (
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted-foreground)", padding: "0.5rem 0" }}>Loading repositories...</p>
                    ) : (
                      <CustomSelect
                        options={[
                          { value: "", label: "Select repository..." },
                          ...ghRepos.map((r) => ({ value: r.name, label: r.name })),
                        ]}
                        value={ghSelectedRepo}
                        onChange={(v) => setGhSelectedRepo(v)}
                      />
                    )}
                  </div>

                  {/* Site name (auto-filled from repo) */}
                  <div>
                    <label style={labelStyle}>Site Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Site" style={inputStyle} />
                    {name && <p style={{ margin: "0.25rem 0 0", fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>ID: {siteId()}</p>}
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
                </>
              )}
            </>
          ) : (
            <>
              {/* Site name for filesystem */}
              <div>
                <label style={labelStyle}>Site Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Site" style={inputStyle} />
                {name && <p style={{ margin: "0.25rem 0 0", fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>ID: {siteId()}</p>}
              </div>
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
            disabled={saving || (adapter === "github" && !ghConnected)}
            style={{
              padding: "0.5rem 1.25rem", borderRadius: "8px", border: "none",
              background: "var(--primary)", color: "var(--primary-foreground)",
              fontSize: "0.85rem", fontWeight: 600,
              cursor: saving || (adapter === "github" && !ghConnected) ? "not-allowed" : "pointer",
              opacity: saving || (adapter === "github" && !ghConnected) ? 0.5 : 1,
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
