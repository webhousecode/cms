"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github, HardDrive } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";

/* ─── Types ───────────────────────────────────────────────── */

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

interface GitHubAccount { login: string; avatar: string; type: "user" | "org" }
interface GitHubRepo { name: string; fullName: string; private: boolean; description: string | null; defaultBranch: string }

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/* ─── Page ────────────────────────────────────────────────── */

export default function NewSitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
  const [ghCreateNew, setGhCreateNew] = useState(true);
  const [ghNewRepoName, setGhNewRepoName] = useState("");
  const [ghNewRepoPrivate, setGhNewRepoPrivate] = useState(true);
  const [branch, setBranch] = useState("main");
  const [contentDir, setContentDir] = useState("content");
  // Filesystem state
  const [configPath, setConfigPath] = useState("");
  const [fsContentDir, setFsContentDir] = useState("");
  // Shared state
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Restore adapter from query params (survives OAuth redirect)
  useEffect(() => {
    const a = searchParams.get("adapter");
    if (a === "filesystem") setAdapter("filesystem");
    const tab = searchParams.get("tab");
    if (tab === "import") setGhCreateNew(false);
  }, [searchParams]);

  // Check GitHub connection status on mount
  useEffect(() => {
    fetch("/api/github?action=status")
      .then((r) => r.json())
      .then((d: { connected: boolean; user?: { login: string } }) => {
        if (d.connected && d.user) {
          setGhConnected(true);
          setGhUser(d.user.login);
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

    const orgId = getCookie("cms-active-org") ?? "";
    const site: SiteEntry = { id, name: name.trim(), adapter, configPath: "", previewUrl: previewUrl || undefined };

    if (adapter === "github") {
      if (!ghSelectedAccount) { setError("Select a GitHub account"); return; }
      let repoName = ghSelectedRepo;

      if (ghCreateNew) {
        if (!ghNewRepoName.trim()) { setError("Enter a repository name"); return; }
        setSaving(true);
        try {
          const createRes = await fetch("/api/github", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create-repo",
              org: ghSelectedAccount,
              name: ghNewRepoName.trim(),
              private: ghNewRepoPrivate,
            }),
          });
          if (!createRes.ok) {
            const d = await createRes.json().catch(() => ({}));
            setError(d.error ?? "Failed to create repository");
            setSaving(false);
            return;
          }
          const created = (await createRes.json()) as { repo: { name: string; defaultBranch: string } };
          repoName = created.repo.name;
          setBranch(created.repo.defaultBranch);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to create repository");
          setSaving(false);
          return;
        }
      } else {
        if (!repoName) { setError("Select a repository"); return; }
      }

      site.configPath = `github://${ghSelectedAccount}/${repoName}/cms.config.ts`;
      site.github = {
        owner: ghSelectedAccount,
        repo: repoName,
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
      router.push("/admin/sites");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create site");
    } finally {
      setSaving(false);
    }
  }

  function connectGitHub() {
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
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Sites</p>
        <h1 className="text-2xl font-bold text-foreground">New site</h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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

                  {/* New repo / Import existing tabs */}
                  <div style={{ display: "flex", gap: "0.25rem", background: "var(--muted)", borderRadius: "8px", padding: "0.2rem" }}>
                    {([
                      { value: true, label: "+ New repo" },
                      { value: false, label: "Import existing" },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => { setGhCreateNew(value); setGhSelectedRepo(""); setGhNewRepoName(""); }}
                        style={{
                          flex: 1, padding: "0.45rem 0.75rem", borderRadius: "6px", border: "none",
                          cursor: "pointer", fontSize: "0.8rem", fontWeight: 500,
                          background: ghCreateNew === value ? "var(--card)" : "transparent",
                          color: ghCreateNew === value ? "var(--foreground)" : "var(--muted-foreground)",
                          boxShadow: ghCreateNew === value ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {ghCreateNew ? (
                    <>
                      <div>
                        <label style={labelStyle}>Repository name</label>
                        <input
                          type="text"
                          value={ghNewRepoName}
                          onChange={(e) => {
                            setGhNewRepoName(e.target.value);
                            if (!name) setName(e.target.value.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
                          }}
                          placeholder="my-new-site"
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Organisation</label>
                        <CustomSelect
                          options={ghAccounts.map((a) => ({
                            value: a.login,
                            label: `${a.login} ${a.type === "org" ? "(org)" : "(personal)"}`,
                          }))}
                          value={ghSelectedAccount}
                          onChange={(v) => setGhSelectedAccount(v)}
                        />
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--muted-foreground)", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={ghNewRepoPrivate}
                          onChange={(e) => setGhNewRepoPrivate(e.target.checked)}
                          style={{ accentColor: "var(--primary)" }}
                        />
                        Private
                      </label>
                    </>
                  ) : (
                    <>
                      <div>
                        <label style={labelStyle}>Organisation</label>
                        <CustomSelect
                          options={ghAccounts.map((a) => ({
                            value: a.login,
                            label: `${a.login} ${a.type === "org" ? "(org)" : "(personal)"}`,
                          }))}
                          value={ghSelectedAccount}
                          onChange={(v) => setGhSelectedAccount(v)}
                        />
                      </div>
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
                    </>
                  )}

                  {/* Site name */}
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
              <div>
                <label style={labelStyle}>Site Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Site" style={inputStyle} />
                {name && <p style={{ margin: "0.25rem 0 0", fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>ID: {siteId()}</p>}
              </div>
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

          {/* Preview URL */}
          <div>
            <label style={labelStyle}>Preview URL (optional)</label>
            <input type="url" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://my-site.example.com" style={inputStyle} />
          </div>

        {error && (
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--destructive)", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "color-mix(in srgb, var(--destructive) 10%, transparent)" }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
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
            {saving ? "Creating..." : "Create site"}
          </button>
          <button type="button" onClick={() => router.push("/admin/sites")} style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.85rem", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
