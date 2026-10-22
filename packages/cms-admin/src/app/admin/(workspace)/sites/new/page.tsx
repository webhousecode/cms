"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github, HardDrive, FolderOpen, Globe } from "lucide-react";
import { WpMigrationPanel } from "@/components/settings/wp-migration-panel";
import { CustomSelect } from "@/components/ui/custom-select";
import { Checkbox } from "@/components/ui/checkbox-styled";
import { useT } from "@/lib/i18n-context";

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
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [adapter, setAdapter] = useState<"github" | "filesystem" | "migrate">("filesystem");
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
  // Import state
  const [importPath, setImportPath] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ collections: string[]; hasDist: boolean } | null>(null);
  const [isMac, setIsMac] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Shared state
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Detect macOS for native folder picker
  useEffect(() => {
    fetch("/api/cms/folder-picker")
      .then((r) => r.json())
      .then((d: { platform: string }) => { if (d.platform === "darwin") setIsMac(true); })
      .catch(() => {});
  }, []);

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
      setName((prev) => prev || repo.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      setBranch(repo.defaultBranch);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghSelectedRepo, ghRepos]);

  async function handleBrowse() {
    try {
      const res = await fetch("/api/cms/folder-picker", { method: "POST" });
      const data = await res.json() as { path?: string; cancelled?: boolean };
      if (data.path) {
        setImportPath(data.path);
        // Auto-trigger import
        setError("");
        setImportResult(null);
        setImporting(true);
        try {
          const scanRes = await fetch("/api/cms/registry/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderPath: data.path }),
          });
          const scanData = await scanRes.json() as { error?: string; siteName?: string; configPath?: string; contentDir?: string; collections?: string[]; hasDist?: boolean };
          if (!scanRes.ok) { setError(scanData.error ?? t("pages.siteNew.importFailed")); return; }
          if (scanData.siteName) setName(scanData.siteName);
          if (scanData.configPath) setConfigPath(scanData.configPath);
          if (scanData.contentDir) setFsContentDir(scanData.contentDir);
          setImportResult({ collections: scanData.collections ?? [], hasDist: scanData.hasDist ?? false });
        } catch (err) {
          setError(err instanceof Error ? err.message : t("pages.siteNew.importFailed"));
        } finally {
          setImporting(false);
        }
      }
    } catch { /* cancelled or error */ }
  }

  async function handleImport() {
    setError("");
    setImportResult(null);
    if (!importPath.trim()) { setError(t("pages.siteNew.enterFolderPath")); return; }
    setImporting(true);
    try {
      const res = await fetch("/api/cms/registry/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: importPath.trim() }),
      });
      const data = await res.json() as { error?: string; siteName?: string; configPath?: string; contentDir?: string; collections?: string[]; hasDist?: boolean };
      if (!res.ok) {
        setError(data.error ?? t("pages.siteNew.importFailed"));
        return;
      }
      // Auto-fill form fields
      if (data.siteName) setName(data.siteName);
      if (data.configPath) setConfigPath(data.configPath);
      if (data.contentDir) setFsContentDir(data.contentDir);
      setImportResult({ collections: data.collections ?? [], hasDist: data.hasDist ?? false });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pages.siteNew.importFailed"));
    } finally {
      setImporting(false);
    }
  }

  function siteId(): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-site";
  }

  async function handleCreate() {
    setError("");
    const id = siteId();
    if (!name.trim()) { setError(t("pages.siteNew.siteNameRequired")); return; }

    const orgId = getCookie("cms-active-org") ?? "";
    if (adapter === "migrate") return; // Migration handled by WpMigrationPanel
    const site: SiteEntry = { id, name: name.trim(), adapter, configPath: "", previewUrl: previewUrl || undefined };

    if (adapter === "github") {
      if (!ghSelectedAccount) { setError(t("pages.siteNew.selectGithubAccount")); return; }
      let repoName = ghSelectedRepo;

      if (ghCreateNew) {
        if (!ghNewRepoName.trim()) { setError(t("pages.siteNew.enterRepoName")); return; }
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
            setError(d.error ?? t("pages.siteNew.createRepoFailed"));
            setSaving(false);
            return;
          }
          const created = (await createRes.json()) as { repo: { name: string; defaultBranch: string } };
          repoName = created.repo.name;
          setBranch(created.repo.defaultBranch);
        } catch (err) {
          setError(err instanceof Error ? err.message : t("pages.siteNew.createRepoFailed"));
          setSaving(false);
          return;
        }
      } else {
        if (!repoName) { setError(t("pages.siteNew.selectRepo")); return; }
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
      if (!configPath.trim()) { setError(t("pages.siteNew.configPathRequired")); return; }
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
        throw new Error(d.error ?? t("pages.siteNew.failedStatus", { status: res.status }));
      }
      window.dispatchEvent(new CustomEvent("cms-registry-change"));
      router.push("/admin/sites");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pages.siteNew.createSiteFailed"));
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
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">{t("pages.siteNew.eyebrow")}</p>
        <h1 className="text-2xl font-bold text-foreground">{t("pages.siteNew.title")}</h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Adapter picker */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {([
              { value: "filesystem" as const, label: "pages.siteNew.adapterFilesystem", icon: HardDrive },
              { value: "github" as const, label: "pages.siteNew.adapterGithub", icon: Github },
              // F03: Migrate tab parked — backend done, UI needs redesign
              // { value: "migrate" as const, label: "Migrate", icon: Globe },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                data-testid={`new-site-adapter-${value}`}
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
                <Icon style={{ width: 16, height: 16 }} /> {t(label)}
              </button>
            ))}
          </div>

          {adapter === "github" ? (
            <>
              {!ghConnected ? (
                <button
                  data-testid="new-site-github-connect"
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
                  {t("pages.siteNew.connectGithub")}
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
                      {t("pages.siteNew.connectedAs")} <strong>{ghUser}</strong>
                    </span>
                    <span style={{ display: "flex", gap: "0.75rem" }}>
                      <a data-testid="new-site-manage-github-access" href={`https://github.com/settings/connections/applications/${process.env.NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID ?? ""}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--muted-foreground)", fontSize: "0.75rem", textDecoration: "underline", cursor: "pointer" }}>
                        {t("pages.siteNew.manageAccess")}
                      </a>
                      <button data-testid="new-site-github-disconnect" type="button" onClick={disconnectGitHub} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.75rem", textDecoration: "underline" }}>
                        {t("pages.siteNew.disconnect")}
                      </button>
                    </span>
                  </div>

                  {/* New repo / Import existing tabs */}
                  <div style={{ display: "flex", gap: "0.25rem", background: "var(--muted)", borderRadius: "8px", padding: "0.2rem" }}>
                    {([
                      { value: true, label: "pages.siteNew.tabNewRepo" },
                      { value: false, label: "pages.siteNew.tabImportExisting" },
                    ] as const).map(({ value, label }) => (
                      <button
                        data-testid={`new-site-gh-tab-${value ? 'new' : 'existing'}`}
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
                        {t(label)}
                      </button>
                    ))}
                  </div>

                  {ghCreateNew ? (
                    <>
                      <div>
                        <label style={labelStyle}>{t("pages.siteNew.repoName")}</label>
                        <input
                          data-testid="new-site-gh-repo-name"
                          type="text"
                          value={ghNewRepoName}
                          onChange={(e) => {
                            setGhNewRepoName(e.target.value);
                            if (!name) setName(e.target.value.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
                          }}
                          placeholder={t("pages.siteNew.repoNamePlaceholder")}
                          style={{ ...inputStyle, fontFamily: "monospace" }}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>{t("pages.siteNew.organisation")}</label>
                        <CustomSelect
                          options={ghAccounts.map((a) => ({
                            value: a.login,
                            label: `${a.login} ${a.type === "org" ? t("pages.siteNew.orgSuffix") : t("pages.siteNew.personalSuffix")}`,
                          }))}
                          value={ghSelectedAccount}
                          onChange={(v) => setGhSelectedAccount(v)}
                        />
                      </div>
                      <Checkbox
                        checked={ghNewRepoPrivate}
                        onChange={(v) => setGhNewRepoPrivate(v)}
                        label={t("pages.siteNew.private")}
                      />
                    </>
                  ) : (
                    <>
                      <div>
                        <label style={labelStyle}>{t("pages.siteNew.organisation")}</label>
                        <CustomSelect
                          options={ghAccounts.map((a) => ({
                            value: a.login,
                            label: `${a.login} ${a.type === "org" ? t("pages.siteNew.orgSuffix") : t("pages.siteNew.personalSuffix")}`,
                          }))}
                          value={ghSelectedAccount}
                          onChange={(v) => setGhSelectedAccount(v)}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>{t("pages.siteNew.repository")}</label>
                        {ghLoadingRepos ? (
                          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted-foreground)", padding: "0.5rem 0" }}>{t("pages.siteNew.loadingRepos")}</p>
                        ) : (
                          <CustomSelect
                            options={[
                              { value: "", label: t("pages.siteNew.selectRepoPlaceholder") },
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
                    <label style={labelStyle}>{t("pages.siteNew.siteName")}</label>
                    <input data-testid="new-site-name-gh" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pages.siteNew.siteNamePlaceholder")} style={inputStyle} />
                    {name && <p style={{ margin: "0.25rem 0 0", fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{t("pages.siteNew.idLabel", { id: siteId() })}</p>}
                  </div>

                  {/* Branch + Content dir */}
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>{t("pages.siteNew.branch")}</label>
                      <input data-testid="new-site-branch" type="text" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder={t("pages.siteNew.branchPlaceholder")} style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>{t("pages.siteNew.contentDir")}</label>
                      <input data-testid="new-site-content-dir" type="text" value={contentDir} onChange={(e) => setContentDir(e.target.value)} placeholder={t("pages.siteNew.contentDirPlaceholder")} style={inputStyle} />
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Import from folder */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  // Try to get folder path from drag
                  const items = e.dataTransfer.items;
                  if (items.length > 0) {
                    const item = items[0];
                    // webkitGetAsEntry gives us the full path for local files
                    const entry = item.webkitGetAsEntry?.();
                    if (entry?.isDirectory) {
                      // For directories, fullPath gives us the name but not the absolute path
                      // We need to use the file's path property
                      const files = e.dataTransfer.files;
                      if (files.length > 0) {
                        // File.path is an Electron-only property; in browsers we get the name
                        const filePath = (files[0] as File & { path?: string }).path;
                        if (filePath) {
                          setImportPath(filePath);
                          // Auto-trigger import
                          setTimeout(() => handleImport(), 100);
                        }
                      }
                    }
                  }
                  // Fallback: check for text/plain (e.g. dragged from terminal)
                  const text = e.dataTransfer.getData("text/plain")?.trim();
                  if (text && text.startsWith("/")) {
                    setImportPath(text);
                    setTimeout(() => handleImport(), 100);
                  }
                }}
                style={{
                  padding: "1rem", borderRadius: "8px",
                  border: dragging ? "2px dashed var(--primary)" : "1px solid var(--border)",
                  background: dragging ? "color-mix(in srgb, var(--primary) 5%, var(--card))" : "var(--card)",
                  transition: "all 0.2s",
                }}
              >
                <label style={{ ...labelStyle, marginBottom: "0.5rem" }}>
                  <FolderOpen style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", marginRight: "0.3rem" }} />
                  {t("pages.siteNew.importFromFolder")}
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    data-testid="new-site-import-path"
                    type="text"
                    value={importPath}
                    onChange={(e) => setImportPath(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
                    placeholder={t("pages.siteNew.importPathPlaceholder")}
                    style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: "0.8rem" }}
                  />
                  {isMac && (
                    <button
                      data-testid="new-site-browse-folder"
                      type="button"
                      onClick={handleBrowse}
                      style={{
                        padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border)",
                        background: "transparent", color: "var(--foreground)",
                        fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t("pages.siteNew.browse")}
                    </button>
                  )}
                  <button
                    data-testid="new-site-import-button"
                    type="button"
                    onClick={handleImport}
                    disabled={importing || !importPath.trim()}
                    style={{
                      padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid var(--border)",
                      background: "var(--accent)", color: "var(--foreground)",
                      fontSize: "0.8rem", fontWeight: 500,
                      cursor: importing || !importPath.trim() ? "not-allowed" : "pointer",
                      opacity: importing || !importPath.trim() ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {importing ? t("pages.siteNew.scanning") : t("pages.siteNew.import")}
                  </button>
                </div>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                  {dragging ? t("pages.siteNew.dropHere") : t("pages.siteNew.dragHint")}
                </p>
                {importResult && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
                    {t(importResult.collections.length === 1 ? "pages.siteNew.foundOne" : "pages.siteNew.foundOther", { count: importResult.collections.length, list: importResult.collections.join(", ") })}
                    {importResult.hasDist && t("pages.siteNew.distReady")}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("pages.siteNew.orFillManually")}</span>
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              </div>

              <div>
                <label style={labelStyle}>{t("pages.siteNew.siteName")}</label>
                <input data-testid="new-site-name-fs" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pages.siteNew.siteNamePlaceholder")} style={inputStyle} />
                {name && <p style={{ margin: "0.25rem 0 0", fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{t("pages.siteNew.idLabel", { id: siteId() })}</p>}
              </div>
              <div>
                <label style={labelStyle}>{t("pages.siteNew.configPath")}</label>
                <input data-testid="new-site-config-path" type="text" value={configPath} onChange={(e) => setConfigPath(e.target.value)} placeholder={t("pages.siteNew.configPathPlaceholder")} style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.8rem" }} />
              </div>
              <div>
                <label style={labelStyle}>{t("pages.siteNew.fsContentDir")}</label>
                <input data-testid="new-site-fs-content-dir" type="text" value={fsContentDir} onChange={(e) => setFsContentDir(e.target.value)} placeholder={t("pages.siteNew.fsContentDirPlaceholder")} style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.8rem" }} />
              </div>
            </>
          )}

          {/* Migrate: WP migration wizard replaces the form entirely */}
          {adapter === "migrate" && (
            <WpMigrationPanel orgId={getCookie("cms-active-org") ?? ""} onComplete={(siteId) => {
              document.cookie = `cms-active-site=${siteId};path=/;max-age=31536000`;
              router.push("/admin");
            }} />
          )}

          {/* Preview URL — only for filesystem/github */}
          {adapter !== "migrate" && (
            <div>
              <label style={labelStyle}>{t("pages.siteNew.previewUrl")}</label>
              <input data-testid="new-site-preview-url" type="url" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder={t("pages.siteNew.previewUrlPlaceholder")} style={inputStyle} />
            </div>
          )}

        {error && (
          <p data-testid="new-site-error" style={{ margin: 0, fontSize: "0.8rem", color: "var(--destructive)", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "color-mix(in srgb, var(--destructive) 10%, transparent)" }}>
            {error}
          </p>
        )}

        {/* Actions — only for filesystem/github */}
        {adapter !== "migrate" && (
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              data-testid="new-site-create-button"
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
              {saving ? t("pages.siteNew.creating") : t("pages.siteNew.createSite")}
            </button>
            <button data-testid="new-site-cancel-button" type="button" onClick={() => router.push("/admin/sites")} style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.85rem", cursor: "pointer" }}>
              {t("pages.siteNew.cancel")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
