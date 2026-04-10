"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Globe, MoreVertical, Settings2, Plus, Copy, Eye, ExternalLink, Pencil, LayoutGrid, List, FileStack, Loader2, ArrowUpDown, Play, Square } from "lucide-react";
import { useSiteRole } from "@/hooks/use-site-role";
import { useTabs } from "@/lib/tabs-context";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import { previewPath } from "@/lib/utils";
import { switchSite } from "@/lib/switch-context";
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

function extractPort(url?: string): string | null {
  if (!url) return null;
  try { return new URL(url).port || null; } catch { return null; }
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
  const [stats, setStats] = useState<Record<string, { pages: number; collections: number }>>({});
  const [allowedSiteIds, setAllowedSiteIds] = useState<string[] | null>(null);
  const siteRole = useSiteRole();
  const { openTab } = useTabs();
  const isAdmin = siteRole === "admin";

  const [loaded, setLoaded] = useState(false);
  const [healthMap, setHealthMap] = useState<Record<string, "up" | "down" | "no-preview">>({});
  const [liveUrls, setLiveUrls] = useState<Record<string, string>>({});
  const [siteFilter, setSiteFilter] = useState<"all" | "local" | "github" | "live">("all");
  const [renamingSiteId, setRenamingSiteId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [cloningSite, setCloningSite] = useState<SiteEntry | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneInProgress, setCloneInProgress] = useState(false);
  const [cloneError, setCloneError] = useState("");

  // DEV ONLY — PM2 server status per site (matched by previewUrl port)
  const isDev = process.env.NODE_ENV !== "production";
  const [pm2Status, setPm2Status] = useState<Record<string, { name: string; status: string }>>({});
  const [pm2Busy, setPm2Busy] = useState<string | null>(null);

  async function handleClone() {
    if (!cloningSite || !cloneName.trim()) return;
    setCloneInProgress(true);
    setCloneError("");
    try {
      const res = await fetch("/api/admin/sites/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceSiteId: cloningSite.id,
          newName: cloneName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Clone failed");
      setCloningSite(null);
      setCloneName("");
      loadSites();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloneInProgress(false);
    }
  }
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("cms-sites-view") as "grid" | "list") ?? "grid";
    return "grid";
  });

  const loadPm2 = useCallback(() => {
    if (!isDev) return;
    fetch("/api/admin/pm2")
      .then((r) => r.json())
      .then((d: { processes?: Array<{ name: string; status: string; port: string | null }> }) => {
        const map: Record<string, { name: string; status: string }> = {};
        for (const p of d.processes ?? []) {
          if (p.port) map[p.port] = { name: p.name, status: p.status };
        }
        setPm2Status(map);
      })
      .catch(() => {});
  }, [isDev]);

  async function togglePm2(sitePort: string, action: "start" | "stop") {
    const proc = pm2Status[sitePort];
    if (!proc) return;
    setPm2Busy(sitePort);
    try {
      await fetch("/api/admin/pm2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: proc.name, action }),
      });
      loadPm2();
    } catch { /* ignore */ }
    finally { setPm2Busy(null); }
  }

  const loadSites = useCallback(() => {
    setLoaded(false);
    setStats({});
    setHealthMap({});
    setLiveUrls({});
    Promise.all([
      fetch("/api/cms/registry").then((r) => r.json()),
      fetch("/api/admin/my-sites").then((r) => r.json()),
    ]).then(([d, mySites]: [{ mode: string; registry: Registry | null }, { siteIds: string[] }]) => {
        setAllowedSiteIds(mySites.siteIds);
        if (d.registry) {
          setRegistry(d.registry);
          const orgId = getCookie("cms-active-org") ?? d.registry.defaultOrgId;
          setActiveOrgId(orgId);

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
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    fetch("/api/admin/site-health?all=true")
      .then((r) => r.ok ? r.json() : { sites: {} })
      .then((d: { sites: Record<string, "up" | "down" | "no-preview">; urls?: Record<string, string> }) => {
        setHealthMap(d.sites ?? {});
        setLiveUrls(d.urls ?? {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadSites(); loadPm2(); }, [loadSites, loadPm2]);

  const activeOrg = registry?.orgs.find((o) => o.id === activeOrgId) ?? registry?.orgs[0];
  // Filter to only sites the user has team access to
  const visibleSites = activeOrg?.sites.filter((s) =>
    !allowedSiteIds || allowedSiteIds.includes(s.id)
  ) ?? [];

  function enterSite(site: SiteEntry) {
    switchSite(site.id, activeOrgId);
  }

  function goToSiteSettings(site: SiteEntry) {
    switchSite(site.id, activeOrgId, "/admin/settings");
  }

  async function renameSite(siteId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await fetch("/api/cms/registry/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: activeOrgId, siteId, name: trimmed }),
    });
    setRenamingSiteId(null);
    loadSites();
  }

  // For preview button — sets cookie without navigating away
  function persistSiteChoice(siteId: string) {
    setCookie("cms-active-site", siteId);
    setCookie("cms-active-org", activeOrgId);
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
  }

  if (!loaded) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Loading sites...</p>
      </div>
    );
  }

  if (!registry || !activeOrg || activeOrg.sites.length === 0) {
    return (
      <>
      <ActionBar
        actions={
          <ActionButton variant="primary" onClick={() => router.push("/admin/sites/new")} icon={<Plus style={{ width: 14, height: 14 }} />}>
            New site
          </ActionButton>
        }
      >
        <ActionBarBreadcrumb items={["Sites"]} />
      </ActionBar>
      <div style={{ padding: "2rem", maxWidth: "64rem" }}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "4rem 2rem", border: "1px dashed var(--border)", borderRadius: "12px",
          background: "var(--card)", marginTop: "1rem",
        }}>
          <Globe style={{ width: "2.5rem", height: "2.5rem", color: "var(--muted-foreground)", marginBottom: "1rem", opacity: 0.5 }} />
          <p style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.35rem" }}>No sites yet</p>
          <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: "0 0 1.25rem", textAlign: "center", maxWidth: "320px" }}>
            Add your first site to start managing content. Connect a GitHub repo or use a local filesystem.
          </p>
          <button
            type="button"
            onClick={() => router.push("/admin/sites/new")}
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
      </div>
      </>
    );
  }

  return (
    <>
    <ActionBar
      actions={isAdmin ? (
        <ActionButton variant="primary" onClick={() => router.push("/admin/sites/new")} icon={<Plus style={{ width: 14, height: 14 }} />}>
          New site
        </ActionButton>
      ) : undefined}
    >
      <ActionBarBreadcrumb items={["Sites"]} />
    </ActionBar>
    <div className="p-8 max-w-5xl">

      {/* View toggle + Filter tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden" }}>
          <button
            type="button"
            title="Grid view"
            onClick={() => { setViewMode("grid"); localStorage.setItem("cms-sites-view", "grid"); }}
            style={{
              padding: "0.35rem 0.5rem", border: "none", cursor: "pointer",
              background: viewMode === "grid" ? "var(--secondary)" : "transparent",
              color: viewMode === "grid" ? "var(--foreground)" : "var(--muted-foreground)",
              display: "flex", alignItems: "center",
            }}
          >
            <LayoutGrid style={{ width: "0.875rem", height: "0.875rem" }} />
          </button>
          <button
            type="button"
            title="List view"
            onClick={() => { setViewMode("list"); localStorage.setItem("cms-sites-view", "list"); }}
            style={{
              padding: "0.35rem 0.5rem", border: "none", cursor: "pointer",
              background: viewMode === "list" ? "var(--secondary)" : "transparent",
              color: viewMode === "list" ? "var(--foreground)" : "var(--muted-foreground)",
              display: "flex", alignItems: "center",
              borderLeft: "1px solid var(--border)",
            }}
          >
            <List style={{ width: "0.875rem", height: "0.875rem" }} />
          </button>
        </div>
        <SiteFilters sites={visibleSites} liveUrls={liveUrls} filter={siteFilter} onFilter={setSiteFilter} />
      </div>

      {viewMode === "list" ? (
        <SiteListView
          sites={visibleSites.filter((s) => {
            if (siteFilter === "local") return s.adapter === "filesystem";
            if (siteFilter === "github") return s.adapter === "github";
            if (siteFilter === "live") return !!liveUrls[s.id];
            return true;
          })}
          stats={stats}
          healthMap={healthMap}
          liveUrls={liveUrls}
          onEnter={enterSite}
          onSettings={goToSiteSettings}
          onRename={(site) => { setRenameValue(site.name); setRenamingSiteId(site.id); }}
          onClone={(site) => { setCloningSite(site); setCloneName(`${site.name} (Clone)`); setCloneError(""); }}
          onPreview={async (site) => {
            persistSiteChoice(site.id);
            if (site.previewUrl) {
              openTab(previewPath(site.previewUrl), `Preview: ${site.name}`);
            } else {
              const res = await fetch("/api/preview-serve", { method: "POST" });
              if (res.ok) {
                const { url } = await res.json() as { url: string };
                openTab(previewPath(url), `Preview: ${site.name}`);
              }
            }
          }}
          onCopyId={(id) => navigator.clipboard.writeText(id)}
          pm2Status={pm2Status}
          pm2Busy={pm2Busy}
          onTogglePm2={togglePm2}
        />
      ) : (
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "1rem",
      }}>
        {visibleSites.filter((s) => {
          if (siteFilter === "local") return s.adapter === "filesystem";
          if (siteFilter === "github") return s.adapter === "github";
          if (siteFilter === "live") return !!liveUrls[s.id];
          return true;
        }).map((site) => (
          <div
            key={site.id}
            data-testid={`site-card-${site.id}`}
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
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{
                  width: "0.5rem", height: "0.5rem", borderRadius: "50%", flexShrink: 0,
                  background: healthMap[site.id] === "up" ? "rgb(74 222 128)" : healthMap[site.id] === "down" ? "var(--destructive)" : "var(--muted-foreground)",
                }} title={healthMap[site.id] === "up" ? "Running" : healthMap[site.id] === "down" ? "Unreachable" : "No preview"} />
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>{site.name}</h3>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded-md hover:bg-accent transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer"
                >
                  <MoreVertical style={{ width: "0.875rem", height: "0.875rem", color: "var(--muted-foreground)" }} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenameValue(site.name); setRenamingSiteId(site.id); }}>
                    <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(site.id); }}>
                    <Copy className="mr-2 h-4 w-4 text-muted-foreground" />
                    Copy site ID
                  </DropdownMenuItem>
                  {site.adapter === "filesystem" && (
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setCloningSite(site);
                      setCloneName(`${site.name} (Clone)`);
                      setCloneError("");
                    }}>
                      <FileStack className="mr-2 h-4 w-4 text-muted-foreground" />
                      Clone site
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); goToSiteSettings(site); }}>
                    <Settings2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    Settings
                  </DropdownMenuItem>
                  {isDev && (() => {
                    const port = extractPort(site.previewUrl);
                    const proc = port ? pm2Status[port] : null;
                    if (!proc) return null;
                    const isOnline = proc.status === "online";
                    const busy = pm2Busy === port;
                    return (
                      <DropdownMenuItem
                        disabled={busy}
                        onClick={(e) => { e.stopPropagation(); if (port) togglePm2(port, isOnline ? "stop" : "start"); }}
                      >
                        {isOnline
                          ? <><Square className="mr-2 h-4 w-4 text-destructive" />{busy ? "Stopping…" : "Stop server"}</>
                          : <><Play className="mr-2 h-4 w-4 text-green-500" />{busy ? "Starting…" : "Start server"}</>
                        }
                      </DropdownMenuItem>
                    );
                  })()}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0 0 0.5rem", fontFamily: "monospace" }}>
              {site.adapter === "github" ? "GitHub" : "Filesystem"}{site.previewUrl ? ` · ${site.previewUrl.replace(/^https?:\/\//, "")}` : ""}
            </p>
            {stats[site.id] && (
              <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0 0 0.75rem" }}>
                Pages: {stats[site.id].pages} · Collections: {stats[site.id].collections}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", justifyContent: "space-between" }}>
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
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  persistSiteChoice(site.id);
                  if (site.previewUrl) {
                    openTab(previewPath(site.previewUrl), `Preview: ${site.name}`);
                  } else {
                    const res = await fetch("/api/preview-serve", { method: "POST" });
                    if (res.ok) {
                      const { url } = await res.json() as { url: string };
                      openTab(previewPath(url), `Preview: ${site.name}`);
                    }
                  }
                }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.375rem",
                  fontSize: "0.75rem", fontWeight: 500,
                  padding: "0.3rem 0.75rem", borderRadius: "6px",
                  background: "transparent",
                  color: "var(--muted-foreground)",
                  border: "1px solid var(--border)", cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted-foreground)"; }}
              >
                <Eye style={{ width: "0.8rem", height: "0.8rem" }} />
                Preview
              </button>
              {liveUrls[site.id] && (
                <a
                  href={liveUrls[site.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "0.375rem",
                    fontSize: "0.75rem", fontWeight: 500,
                    padding: "0.3rem 0.75rem", borderRadius: "6px",
                    background: "transparent",
                    color: "var(--muted-foreground)",
                    border: "1px solid var(--border)", cursor: "pointer",
                    transition: "all 0.2s", textDecoration: "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgb(74 222 128)"; e.currentTarget.style.color = "rgb(74 222 128)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted-foreground)"; }}
                >
                  <ExternalLink style={{ width: "0.8rem", height: "0.8rem" }} />
                  Live
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>

    {/* Rename modal */}
    {renamingSiteId && (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
        onClick={() => setRenamingSiteId(null)}
      >
        <div
          style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem", width: "24rem", boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 1rem" }}>Rename Site</h3>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") renameSite(renamingSiteId, renameValue);
              if (e.key === "Escape") setRenamingSiteId(null);
            }}
            style={{
              width: "100%", padding: "0.5rem 0.75rem", borderRadius: "8px",
              border: "1px solid var(--input)", background: "transparent",
              color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={() => setRenamingSiteId(null)}
              style={{
                padding: "0.4rem 0.875rem", borderRadius: "6px", fontSize: "0.8rem",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)", cursor: "pointer",
              }}
            >No</button>
            <button
              type="button"
              onClick={() => renameSite(renamingSiteId, renameValue)}
              style={{
                padding: "0.4rem 0.875rem", borderRadius: "6px", fontSize: "0.8rem",
                border: "none", background: "var(--primary)", color: "var(--primary-foreground)",
                cursor: "pointer", fontWeight: 500,
              }}
            >Yes</button>
          </div>
        </div>
      </div>
    )}

    {/* Clone modal */}
    {cloningSite && (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
        onClick={() => !cloneInProgress && setCloningSite(null)}
      >
        <div
          style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem", width: "26rem", boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <FileStack style={{ width: 18, height: 18, color: "#F7BB2E" }} />
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>Clone Site</h3>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0 0 1rem", lineHeight: 1.5 }}>
            Creates a complete copy of <strong>{cloningSite.name}</strong> — content, media, config, agents, and brand voice.
            Secrets (API keys, deploy tokens) are stripped from the copy.
          </p>
          <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--muted-foreground)", marginBottom: "0.35rem" }}>
            New site name
          </label>
          <input
            autoFocus
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !cloneInProgress) handleClone();
              if (e.key === "Escape" && !cloneInProgress) setCloningSite(null);
            }}
            disabled={cloneInProgress}
            style={{
              width: "100%", padding: "0.5rem 0.75rem", borderRadius: "8px",
              border: "1px solid var(--input)", background: "transparent",
              color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
              boxSizing: "border-box",
            }}
          />
          {cloneError && (
            <p style={{
              marginTop: "0.75rem", padding: "0.5rem 0.75rem", borderRadius: 6,
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              color: "#ef4444", fontSize: "0.75rem", margin: "0.75rem 0 0",
            }}>{cloneError}</p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={() => setCloningSite(null)}
              disabled={cloneInProgress}
              style={{
                padding: "0.4rem 0.875rem", borderRadius: "6px", fontSize: "0.8rem",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)", cursor: cloneInProgress ? "not-allowed" : "pointer",
                opacity: cloneInProgress ? 0.5 : 1,
              }}
            >Cancel</button>
            <button
              type="button"
              onClick={handleClone}
              disabled={cloneInProgress || !cloneName.trim()}
              style={{
                padding: "0.4rem 0.875rem", borderRadius: "6px", fontSize: "0.8rem",
                border: "none", background: "#F7BB2E", color: "#0D0D0D",
                cursor: cloneInProgress || !cloneName.trim() ? "not-allowed" : "pointer",
                fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.35rem",
                opacity: cloneInProgress || !cloneName.trim() ? 0.5 : 1,
              }}
            >
              {cloneInProgress && <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} />}
              {cloneInProgress ? "Cloning…" : "Clone"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

type SiteSortKey = "name" | "type" | "pages" | "collections" | "status";
type SortDir = "asc" | "desc";

function SiteListView({ sites, stats, healthMap, liveUrls, onEnter, onSettings, onRename, onPreview, onCopyId, onClone, pm2Status: pm2Map, pm2Busy: pm2BusyPort, onTogglePm2 }: {
  sites: SiteEntry[];
  stats: Record<string, { pages: number; collections: number }>;
  healthMap: Record<string, "up" | "down" | "no-preview">;
  liveUrls: Record<string, string>;
  onEnter: (site: SiteEntry) => void;
  onSettings: (site: SiteEntry) => void;
  onRename: (site: SiteEntry) => void;
  onPreview: (site: SiteEntry) => void;
  onCopyId: (id: string) => void;
  onClone?: (site: SiteEntry) => void;
  pm2Status?: Record<string, { name: string; status: string }>;
  pm2Busy?: string | null;
  onTogglePm2?: (port: string, action: "start" | "stop") => void;
}) {
  const pm2StatusMap = pm2Map ?? {};
  const isDev = process.env.NODE_ENV !== "production";
  const [sortKey, setSortKey] = useState<SiteSortKey>(() => {
    if (typeof window === "undefined") return "name";
    return (localStorage.getItem("cms-sites-sort-key") as SiteSortKey) || "name";
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    if (typeof window === "undefined") return "asc";
    return (localStorage.getItem("cms-sites-sort-dir") as SortDir) || "asc";
  });

  function toggleSort(key: SiteSortKey) {
    if (sortKey === key) {
      const next = sortDir === "asc" ? "desc" : "asc";
      setSortDir(next);
      localStorage.setItem("cms-sites-sort-dir", next);
    } else {
      setSortKey(key);
      setSortDir("asc");
      localStorage.setItem("cms-sites-sort-key", key);
      localStorage.setItem("cms-sites-sort-dir", "asc");
    }
  }

  function statusRank(site: SiteEntry): number {
    // Live > Local-up > Local-down/unknown
    if (liveUrls[site.id]) return 2;
    if (healthMap[site.id] === "up") return 1;
    return 0;
  }

  const sorted = [...sites].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    switch (sortKey) {
      case "name":
        av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
      case "type":
        av = a.adapter; bv = b.adapter; break;
      case "pages":
        av = stats[a.id]?.pages ?? -1; bv = stats[b.id]?.pages ?? -1; break;
      case "collections":
        av = stats[a.id]?.collections ?? -1; bv = stats[b.id]?.collections ?? -1; break;
      case "status":
        av = statusRank(a); bv = statusRank(b); break;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const thBase: React.CSSProperties = {
    textAlign: "left", padding: "0.5rem 0.75rem", fontWeight: 500,
    color: "var(--muted-foreground)", fontSize: "0.7rem",
    textTransform: "uppercase", letterSpacing: "0.05em",
  };

  function SortHeader({ label, sk, align = "left" }: { label: string; sk: SiteSortKey; align?: "left" | "right" }) {
    const active = sortKey === sk;
    return (
      <th style={{ ...thBase, textAlign: align }}>
        <button
          type="button"
          onClick={() => toggleSort(sk)}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.25rem",
            background: "none", border: "none", padding: 0, cursor: "pointer",
            color: active ? "var(--foreground)" : "var(--muted-foreground)",
            fontSize: "0.7rem", fontWeight: active ? 600 : 500,
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}
        >
          {label}
          <ArrowUpDown style={{ width: "0.65rem", height: "0.65rem", opacity: active ? 1 : 0.4 }} />
        </button>
      </th>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <SortHeader label="Name" sk="name" />
          <SortHeader label="Type" sk="type" />
          <SortHeader label="Pages" sk="pages" />
          <SortHeader label="Collections" sk="collections" />
          <SortHeader label="Status" sk="status" />
          <th style={{ ...thBase, textAlign: "right" }}></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((site) => (
          <tr
            key={site.id}
            onClick={() => onEnter(site)}
            style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s" }}
            className="hover:bg-accent/50"
          >
            <td style={{ padding: "0.6rem 0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{
                  width: "0.45rem", height: "0.45rem", borderRadius: "50%", flexShrink: 0,
                  background: healthMap[site.id] === "up" ? "rgb(74 222 128)" : healthMap[site.id] === "down" ? "var(--destructive)" : "var(--muted-foreground)",
                }} />
                <span style={{ fontWeight: 500 }}>{site.name}</span>
              </div>
            </td>
            <td style={{ padding: "0.6rem 0.75rem", color: "var(--muted-foreground)" }}>
              {site.adapter === "github" ? "GitHub" : "Filesystem"}
            </td>
            <td style={{ padding: "0.6rem 0.75rem", color: "var(--muted-foreground)" }}>
              {stats[site.id]?.pages ?? "—"}
            </td>
            <td style={{ padding: "0.6rem 0.75rem", color: "var(--muted-foreground)" }}>
              {stats[site.id]?.collections ?? "—"}
            </td>
            <td style={{ padding: "0.6rem 0.75rem" }}>
              <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                {liveUrls[site.id] && (
                  <a
                    href={liveUrls[site.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.03em",
                      padding: "0.15rem 0.4rem", borderRadius: "4px",
                      background: "color-mix(in srgb, #22c55e 15%, transparent)",
                      color: "#22c55e", textTransform: "uppercase", textDecoration: "none",
                    }}
                  >
                    Live
                  </a>
                )}
                <span style={{
                  fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.03em",
                  padding: "0.15rem 0.4rem", borderRadius: "4px",
                  background: "var(--muted)",
                  color: "var(--muted-foreground)", textTransform: "uppercase",
                }}>
                  {site.adapter === "github" ? "GitHub" : "Local"}
                </span>
              </div>
            </td>
            <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>
              <div style={{ display: "flex", gap: "0.25rem", justifyContent: "flex-end", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onPreview(site); }}
                  style={{
                    padding: "0.25rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)",
                    background: "transparent", color: "var(--muted-foreground)", cursor: "pointer",
                    fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: "0.25rem",
                  }}
                >
                  <Eye style={{ width: "0.7rem", height: "0.7rem" }} />
                  Preview
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 rounded-md hover:bg-accent transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer"
                  >
                    <MoreVertical style={{ width: "0.8rem", height: "0.8rem", color: "var(--muted-foreground)" }} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(site); }}>
                      <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopyId(site.id); }}>
                      <Copy className="mr-2 h-4 w-4 text-muted-foreground" />
                      Copy site ID
                    </DropdownMenuItem>
                    {site.adapter === "filesystem" && onClone && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClone(site); }}>
                        <FileStack className="mr-2 h-4 w-4 text-muted-foreground" />
                        Clone site
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSettings(site); }}>
                      <Settings2 className="mr-2 h-4 w-4 text-muted-foreground" />
                      Settings
                    </DropdownMenuItem>
                    {isDev && (() => {
                      const port = extractPort(site.previewUrl);
                      const proc = port ? pm2StatusMap[port] : null;
                      if (!proc) return null;
                      const isOnline = proc.status === "online";
                      const busy = pm2BusyPort === port;
                      return (
                        <DropdownMenuItem
                          disabled={busy}
                          onClick={(e) => { e.stopPropagation(); if (port && onTogglePm2) onTogglePm2(port, isOnline ? "stop" : "start"); }}
                        >
                          {isOnline
                            ? <><Square className="mr-2 h-4 w-4 text-destructive" />{busy ? "Stopping…" : "Stop server"}</>
                            : <><Play className="mr-2 h-4 w-4 text-green-500" />{busy ? "Starting…" : "Start server"}</>
                          }
                        </DropdownMenuItem>
                      );
                    })()}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SiteFilters({ sites, liveUrls, filter, onFilter }: {
  sites: SiteEntry[];
  liveUrls: Record<string, string>;
  filter: string;
  onFilter: (f: "all" | "local" | "github" | "live") => void;
}) {
  const liveCount = sites.filter((s) => !!liveUrls[s.id]).length;
  const tabs = [
    { key: "all" as const, label: "All", count: sites.length },
    { key: "local" as const, label: "Local", count: sites.filter((s) => s.adapter === "filesystem").length },
    { key: "github" as const, label: "GitHub", count: sites.filter((s) => s.adapter === "github").length },
    { key: "live" as const, label: "Live", count: liveCount },
  ];
  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onFilter(t.key)}
          style={{
            padding: "0.3rem 0.75rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 500,
            cursor: "pointer",
            background: filter === t.key ? "var(--secondary)" : "transparent",
            color: filter === t.key ? (t.key === "live" ? "rgb(74 222 128)" : "var(--foreground)") : "var(--muted-foreground)",
            border: filter === t.key ? "1px solid var(--border)" : "1px solid transparent",
          }}
        >
          {t.label} ({t.count})
        </button>
      ))}
    </div>
  );
}
