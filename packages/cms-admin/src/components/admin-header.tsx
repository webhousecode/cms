"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTabs } from "@/lib/tabs-context";
import { OrgSwitcher, SiteSwitcher } from "@/components/site-switcher";
import { useHeaderData, HeaderDataProvider } from "@/lib/header-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, Fingerprint, Check, Moon, Sun, Monitor, LogOut, Search, ExternalLink, Rocket, Loader2, MessageSquare, LayoutDashboard, Plus, History, Languages, Hammer, Building2 } from "lucide-react";
import type { AdminMode } from "@/lib/hooks/use-admin-mode";
import { HelpButton } from "@/components/help-drawer";
import { BuildLogPanel } from "@/components/build/build-log-panel";
import { usePermissions } from "@/hooks/use-permissions";
import { useThemeAxes, type Temperature } from "@/lib/hooks/use-theme-axes";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { previewPath } from "@/lib/utils";

interface SessionUser {
  email: string;
  name: string;
  id: string;
  gravatarUrl?: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const TEMP_OPTIONS: { value: Temperature; label: string }[] = [
  { value: "neutral", label: "Neutral" },
  { value: "cool",    label: "Cool" },
  { value: "warm",    label: "Warm" },
];

function ThemeItems() {
  const { brightness, temperature, setBrightness, setTemperature } = useThemeAxes();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Theme</DropdownMenuLabel>
      {/* Brightness */}
      {([
        { value: "dark" as const, label: "Dark", icon: Moon },
        { value: "light" as const, label: "Light", icon: Sun },
        { value: "system" as const, label: "System", icon: Monitor },
      ]).map(({ value, label, icon: Icon }) => (
        <DropdownMenuItem key={value} onClick={() => setBrightness(value)}>
          <Icon className="mr-2 h-4 w-4" />
          {label}
          {brightness === value && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
      ))}
      {/* Temperature segmented control */}
      <div style={{ padding: "6px 8px 4px" }}>
        <div style={{ display: "flex", borderRadius: "6px", border: "1px solid var(--border)", padding: "2px", gap: "2px" }}>
          {TEMP_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={(e) => { e.stopPropagation(); setTemperature(value); }}
              style={{
                flex: 1,
                padding: "3px 8px",
                fontSize: "0.7rem",
                fontWeight: 500,
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
                transition: "all 150ms",
                background: temperature === value ? "var(--primary)" : "transparent",
                color: temperature === value ? "var(--primary-foreground)" : "var(--muted-foreground)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </DropdownMenuGroup>
  );
}

function UserNav({ user }: { user: SessionUser | null }) {
  const displayName = user?.name ?? "Admin";
  const initials = user ? getInitials(user.name) : "";
  const router = useRouter();
  const can = usePermissions();
  const { isAdminEmpty } = useHeaderData();

  async function logout() {
    sessionStorage.removeItem("cms-session-user");
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-transparent border-0 p-0 cursor-pointer" aria-label={`User menu: ${displayName}`}>
        <Avatar className="h-8 w-8">
          {user?.gravatarUrl && <AvatarImage src={user.gravatarUrl} alt={displayName} />}
          <AvatarFallback className="text-xs">
            {initials || user?.email?.[0]?.toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ width: "223px" }}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold">{displayName}</p>
              {user?.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => { window.dispatchEvent(new CustomEvent("cms:navigate-admin", { detail: { path: "/admin/account" } })); router.push("/admin/account"); }}>
            <Settings className="mr-2 h-4 w-4" />
            Account Preferences
          </DropdownMenuItem>
          {can("settings.edit") && !isAdminEmpty && (
            <DropdownMenuItem onClick={() => { window.dispatchEvent(new CustomEvent("cms:navigate-admin", { detail: { path: "/admin/settings" } })); router.push("/admin/settings"); }}>
              <Settings className="mr-2 h-4 w-4" />
              Site Settings
            </DropdownMenuItem>
          )}
          {can("settings.edit") && !isAdminEmpty && (
            // Org-settings page reads cms-active-org cookie to scope to the
            // currently shown org in the OrgSwitcher — no need to pass orgId
            // through the URL. Saves the user from clicking "All organizations"
            // → row → kebab → Settings just to tweak the active org.
            <DropdownMenuItem onClick={() => { window.dispatchEvent(new CustomEvent("cms:navigate-admin", { detail: { path: "/admin/organizations/settings" } })); router.push("/admin/organizations/settings"); }}>
              <Building2 className="mr-2 h-4 w-4" />
              Organization Settings
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <ThemeItems />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={logout} className="text-muted-foreground">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeployButton() {
  const router = useRouter();
  const can = usePermissions();
  const { user, siteConfig } = useHeaderData();
  const [provider, setProvider] = useState<string>("off");
  const [canRebuildCode, setCanRebuildCode] = useState<boolean | null>(null);
  const [canPublishContent, setCanPublishContent] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [deploying, setDeploying] = useState(false);
  const [deployPhase, setDeployPhase] = useState<string>("");
  const [lastResult, setLastResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Always probe capability — we can't trust deployProvider alone because a
  // Beam-imported SSR site may have provider="flyio" set in config but no
  // Dockerfile on the volume to actually rebuild from. Calling can-deploy
  // gives us the truth so we can hide the rocket button rather than show a
  // useless error toast on every click.
  useEffect(() => {
    if (!siteConfig) return;
    fetch("/api/admin/deploy/can-deploy")
      .then((r) => r.ok ? r.json() : null)
      .then((d: { canRebuildCode?: boolean; canPublishContent?: boolean; provider?: string; reason?: string } | null) => {
        if (!d) { setCanRebuildCode(false); return; }
        setCanRebuildCode(!!d.canRebuildCode);
        setCanPublishContent(!!d.canPublishContent);
        setReason(d.reason);
        setProvider(d.canRebuildCode ? (d.provider ?? "off") : "off");
      })
      .catch(() => setCanRebuildCode(false));
  }, [siteConfig]);

  // SSE listener for deploy-done push from GitHub Actions webhook
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    function connect() {
      es = new EventSource("/api/admin/deploy/notify");
      es.addEventListener("message", (e) => {
        try {
          const d = JSON.parse(e.data) as { event?: string; status?: string; url?: string; duration?: number };
          if (d.event !== "deploy-done") return;
          // Stop polling if active
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setDeploying(false);
          setDeployPhase("");
          const elapsed = pollStartRef.current ? Math.round((Date.now() - pollStartRef.current) / 1000) : undefined;
          if (d.status === "success") {
            const desc = d.url
              ? `${d.url}${elapsed ? ` · ${elapsed}s` : ""}`
              : `Live in${elapsed ? ` ${elapsed}s` : ""}!`;
            toast.success("Published! 🚀", {
              description: desc,
              duration: 12000,
              action: d.url ? { label: "Open", onClick: () => window.open(d.url, "_blank") } : undefined,
            });
            window.dispatchEvent(new CustomEvent("cms-site-change", { detail: {} }));
          } else {
            toast.error("Deploy failed", { description: "Check GitHub Actions for details.", duration: 10000 });
          }
        } catch { /* ignore parse errors */ }
      });
      es.onerror = () => { es?.close(); retry = setTimeout(connect, 5000); };
    }
    connect();
    return () => { es?.close(); clearTimeout(retry); };
  }, []);

  // Poll GitHub Actions status after a webhook deploy
  function startPolling(liveUrl?: string) {
    pollStartRef.current = Date.now();
    setDeployPhase("Queued...");
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch("/api/admin/deploy/github-status");
        if (!r.ok) return;
        const d = await r.json() as { found: boolean; status?: string; conclusion?: string };
        if (!d.found) return;
        if (d.status === "queued") setDeployPhase("Queued...");
        else if (d.status === "in_progress") setDeployPhase("Building...");
        else if (d.status === "completed") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setDeploying(false);
          setDeployPhase("");
          const elapsed = Math.round((Date.now() - pollStartRef.current) / 1000);
          if (d.conclusion === "success") {
            toast.success("Published! 🚀", {
              description: liveUrl ? `${liveUrl} · ${elapsed}s` : `Done in ${elapsed}s`,
              duration: 12000,
              action: liveUrl ? { label: "Open", onClick: () => window.open(liveUrl, "_blank") } : undefined,
            });
            window.dispatchEvent(new CustomEvent("cms-site-change", { detail: {} }));
          } else {
            toast.error("Deploy failed", { description: "Check GitHub Actions for details.", duration: 10000 });
          }
        }
      } catch { /* keep polling */ }
    }, 8000);

    // Safety: stop polling after 10 minutes
    setTimeout(() => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; setDeploying(false); setDeployPhase(""); }
    }, 600_000);
  }

  /**
   * GitHub Pages-specific live tracking: opens an SSE channel to receive
   * `page_build` webhook events instantly when GH finishes deploying.
   * Falls back to polling if the SSE stream errors (e.g. proxy strips
   * event-stream Content-Type).
   */
  function startPagesBuildTracking(liveUrl?: string) {
    const startedAt = Date.now();
    const siteId = (document.cookie.match(/(?:^|;\s*)cms-active-site=([^;]+)/) ?? [, ""])[1];
    if (!siteId) return; // no active site → nothing to subscribe to

    let es: EventSource | null = null;
    let fellBackToPolling = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;

    const finishBuilt = () => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      toast.success("Live on GitHub Pages 🌐", {
        description: liveUrl ? `${liveUrl} · ready in ${elapsed}s` : `Ready in ${elapsed}s`,
        duration: 12000,
        ...(liveUrl && { action: { label: "Open", onClick: () => window.open(liveUrl, "_blank") } }),
      });
      cleanup();
    };
    const finishErrored = (errMsg?: string) => {
      toast.error("GitHub Pages build failed", {
        description: errMsg ?? "See repo → Settings → Pages for details.",
        duration: 12000,
      });
      cleanup();
    };
    const cleanup = () => {
      if (es) { es.close(); es = null; }
      if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
    };

    // Primary path: SSE
    try {
      es = new EventSource(`/api/admin/deploy/events?site=${encodeURIComponent(decodeURIComponent(siteId))}`);
      es.addEventListener("page-build", (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data) as {
            status: "queued" | "building" | "built" | "errored";
            url?: string;
            error?: string;
          };
          if (d.status === "built") finishBuilt();
          else if (d.status === "errored") finishErrored(d.error);
        } catch { /* ignore malformed */ }
      });
      es.addEventListener("error", () => {
        if (fellBackToPolling) return;
        fellBackToPolling = true;
        if (es) { es.close(); es = null; }
        startPolling();
      });
    } catch {
      startPolling();
    }

    // Fallback path: existing polling (only used if SSE never comes up)
    function startPolling() {
      const sinceSec = Math.floor(startedAt / 1000) - 30;
      pollHandle = setInterval(async () => {
        try {
          const r = await fetch(`/api/admin/deploy/pages-build-status?since=${sinceSec}`);
          if (!r.ok) return;
          const d = await r.json() as {
            found: boolean;
            status?: "queued" | "building" | "built" | "errored";
            isCurrent?: boolean;
            url?: string;
            error?: string | null;
          };
          if (!d.found || !d.isCurrent) return;
          if (d.status === "built") finishBuilt();
          else if (d.status === "errored") finishErrored(d.error ?? undefined);
        } catch { /* keep polling */ }
      }, 10_000);
    }

    // Safety: 10-min ceiling
    setTimeout(cleanup, 600_000);
  }

  const userRole = user?.role ?? user?.siteRole ?? null;
  const isAdminUser = userRole === "admin";

  const handleDeploy = useCallback(async () => {
    // ICD-only site: no rebuild provider configured, but content syncs live
    // via the revalidate webhook. Clicking the rocket triggers a manual
    // re-sync of all current content (refreshes the live site's cache).
    // It is NOT "deploy not configured" — that toast was the bug that
    // confused everyone with an "ICD · auto" pill next to a rocket
    // claiming nothing was set up.
    if (provider === "off" && canPublishContent) {
      setDeploying(true);
      setLastResult(null);
      setDeployPhase("Re-syncing content...");
      try {
        const res = await fetch("/api/admin/deploy", { method: "POST", signal: AbortSignal.timeout(120_000) });
        const data = await res.json() as { status: string; error?: string; url?: string };
        if (data.status === "success") {
          toast.success("Content re-synced", { description: "Live site cache refreshed.", duration: 4000 });
        } else {
          toast.error("Re-sync failed", { description: data.error ?? "Unknown error", duration: 8000 });
        }
      } catch {
        toast.error("Re-sync failed", { description: "Request failed", duration: 8000 });
      }
      setDeploying(false);
      setDeployPhase("");
      return;
    }

    // Truly nothing configured (no ICD, no rebuild) → tell the user
    if (provider === "off") {
      if (isAdminUser) {
        toast.info("Deploy not configured", {
          description: "Set up a deploy provider for this site.",
          action: { label: "Configure", onClick: () => router.push("/admin/settings?tab=deploy") },
          duration: 8000,
        });
      } else {
        toast.info("Deploy not configured", {
          description: "Ask your site admin to set up a deploy provider.",
          duration: 5000,
        });
      }
      return;
    }

    setDeploying(true);
    setLastResult(null);
    setDeployPhase("Sending...");
    try {
      const res = await fetch("/api/admin/deploy", { method: "POST", signal: AbortSignal.timeout(120_000) });
      const data = await res.json() as { status: string; error?: string; url?: string; async?: boolean };

      // Webhook/GitHub Actions deploy: async — switch to polling mode
      if (data.status === "success" && data.async) {
        toast.info("Deploy queued", {
          description: "GitHub Actions is building your site. You'll be notified when it's live.",
          duration: 6000,
        });
        startPolling(data.url);
        return; // polling takes over — don't setDeploying(false) yet
      }

      // Synchronous deploy (local build, flyio, github-pages direct)
      setLastResult({ ok: data.status === "success", error: data.error });
      setTimeout(() => setLastResult(null), 5000);
      if (data.status === "success" && provider === "github-pages") {
        // GH-Pages publish-to-API returns success after the API upload,
        // but the actual page_build job is async (1-3 min typical, up to
        // 10 min on cold cache). Tell the user upfront, then poll the
        // pages/builds/latest endpoint and fire a follow-up "live" toast
        // once status === "built".
        toast.success("Published 🚀 — building on GitHub Pages", {
          description: data.url
            ? `${data.url} · live in 1–3 min (sometimes longer)`
            : "GitHub Pages typically deploys in 1–3 minutes.",
          duration: 10000,
          ...(data.url && { action: { label: "Open", onClick: () => window.open(data.url, "_blank") } }),
        });
        window.dispatchEvent(new CustomEvent("cms-site-change", { detail: {} }));
        startPagesBuildTracking(data.url);
        return; // polling fires the "Live" follow-up toast
      } else if (data.status === "success" && data.url) {
        toast.success("Published!", {
          description: data.url,
          duration: 10000,
          action: { label: "Open", onClick: () => window.open(data.url, "_blank") },
        });
        window.dispatchEvent(new CustomEvent("cms-site-change", { detail: {} }));
      } else if (data.status === "success") {
        toast.success("Published!", { description: "Your changes are now live.", duration: 5000 });
      } else if (data.status === "error") {
        toast.error("Publish failed", { description: data.error, duration: 8000 });
      }
    } catch {
      setLastResult({ ok: false, error: "Request failed" });
    }
    setDeploying(false);
    setDeployPhase("");
  }, [provider, canPublishContent, isAdminUser, router]);

  // "d" shortcut → deploy
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "d" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      // Allow the shortcut for ICD-only sites too — handleDeploy distinguishes.
      if (provider === "off" && !canPublishContent) return;
      e.preventDefault();
      handleDeploy();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [provider, canPublishContent, handleDeploy]);

  // Capability probe still in flight — render nothing rather than flashing
  // the rocket and yanking it away.
  if (canRebuildCode === null) return null;

  // SSR site whose code lives in a separate repo: rebuild button doesn't make
  // sense (we have no Dockerfile / build pipeline locally), but content edits
  // DO go live via ICD. Show the "auto-syncs" pill AS WELL AS the rocket so
  // admins can manually trigger a revalidate when they want to.
  const showIcdPill = !canRebuildCode && canPublishContent;

  // Neither rebuild nor ICD configured: still show the rocket so admins can
  // click it and get the "Deploy not configured" toast with a Configure CTA.
  // For non-admins we hide it entirely — there's nothing they can do.
  if (!canRebuildCode && !canPublishContent && !isAdminUser) return null;

  // Async deploy with phase label (GitHub Actions / webhook)
  if (deploying && deployPhase) {
    return (
      <span
        title={deployPhase}
        style={{
          display: "flex", alignItems: "center", gap: "0.3rem",
          fontSize: "0.65rem", color: "var(--muted-foreground)",
          border: "1.5px solid var(--border)", borderRadius: "999px",
          padding: "0.2rem 0.55rem", whiteSpace: "nowrap",
          fontFamily: "monospace",
        }}
      >
        <Loader2 style={{ width: "0.75rem", height: "0.75rem" }} className="animate-spin" />
        {deployPhase}
      </span>
    );
  }

  // ICD pill is shown when content auto-syncs to a separate-repo SSR site.
  // In that mode the rocket is redundant (every save already syncs). Hide
  // the rocket entirely; the pill carries both the status and a click-to-
  // resync affordance.
  if (showIcdPill) {
    return (
      <button
        type="button"
        onClick={handleDeploy}
        disabled={deploying}
        title={deploying ? "Re-syncing..." : (reason ?? "Content auto-syncs on save. Click to manually re-sync everything.")}
        aria-label="ICD status — click to manually re-sync"
        style={{
          fontSize: "0.65rem",
          padding: "0.2rem 0.55rem",
          borderRadius: "999px",
          border: "1px solid var(--border)",
          color: "var(--muted-foreground)",
          background: "transparent",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          cursor: deploying ? "wait" : "pointer",
        }}
      >
        {deploying ? "ICD · syncing…" : "ICD · auto"}
      </button>
    );
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
    <button
      type="button"
      onClick={handleDeploy}
      disabled={deploying}
      title={deploying ? "Publishing..." : lastResult ? (lastResult.ok ? "Published!" : `Publish failed: ${lastResult.error}`) : provider === "off" ? "Deploy not configured" : "Publish changes"}
      aria-label="Publish changes"
      style={{
        background: "none",
        border: "1.5px solid var(--border)",
        cursor: deploying ? "wait" : "pointer",
        color: lastResult ? (lastResult.ok ? "rgb(74 222 128)" : "var(--destructive)") : "var(--muted-foreground)",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "50%",
        width: "2rem", height: "2rem",
        padding: 0,
      }}
      className="hover:border-foreground hover:text-foreground transition-colors"
    >
      {deploying
        ? <Loader2 style={{ width: "0.9rem", height: "0.9rem" }} className="animate-spin" />
        : lastResult?.ok
          ? <Check style={{ width: "0.9rem", height: "0.9rem" }} />
          : <Rocket style={{ width: "0.9rem", height: "0.9rem" }} />}
    </button>
    </span>
  );
}

interface BuildProfileInfo {
  name: string;
  description?: string;
  isDefault: boolean;
}

/**
 * Persistent pill shown in the admin header while a Beam transfer is running
 * in the background. Listens for `cms:beam-started` and `cms:beam-done` events
 * dispatched by BeamSettingsPanel / BeamProgressModal.
 *
 * Click to re-open the progress modal at /admin/settings?tab=beam
 * (full page nav so we re-mount the panel with active beamId in URL).
 */
// Module-level dedupe: WorkspaceShell mounts two AdminHeaders (chat + traditional)
// so each event fires twice. Track which beamIds we've already toasted so we
// don't show duplicate notifications.
const toastedBeamIds = new Set<string>();

function BeamPill() {
  const router = useRouter();
  const [activeBeamId, setActiveBeamId] = useState<string | null>(null);

  useEffect(() => {
    function onStart(e: Event) {
      const { beamId } = (e as CustomEvent).detail;
      setActiveBeamId(beamId);
    }
    function onDone(e: Event) {
      const { beamId, success, error } = (e as CustomEvent).detail as { beamId: string; success: boolean; error?: string };
      setActiveBeamId(null);
      if (toastedBeamIds.has(beamId)) return;
      toastedBeamIds.add(beamId);
      if (success) toast.success("Beam complete 🚀", { description: "Site transferred successfully", duration: 8000 });
      else toast.error("Beam failed", { description: error ?? "Transfer failed", duration: 10000 });
    }
    window.addEventListener("cms:beam-started", onStart);
    window.addEventListener("cms:beam-done", onDone);
    return () => {
      window.removeEventListener("cms:beam-started", onStart);
      window.removeEventListener("cms:beam-done", onDone);
    };
  }, []);

  if (!activeBeamId) return null;

  return (
    <button
      type="button"
      onClick={() => router.push(`/admin/settings?tab=beam&active=${activeBeamId}`)}
      title="Beam in progress — click to view"
      style={{
        display: "flex", alignItems: "center", gap: "0.35rem",
        fontSize: "0.65rem", color: "#F7BB2E",
        border: "1px solid #F7BB2E", borderRadius: "999px",
        padding: "0.2rem 0.6rem", whiteSpace: "nowrap",
        fontFamily: "monospace", background: "transparent",
        cursor: "pointer",
      }}
    >
      <Loader2 style={{ width: "0.75rem", height: "0.75rem" }} className="animate-spin" />
      Beaming…
    </button>
  );
}

function BuildButton() {
  const [hasBuildCommand, setHasBuildCommand] = useState(false);
  const [profiles, setProfiles] = useState<BuildProfileInfo[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string | undefined>();
  const [panelOpen, setPanelOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    function onSiteChange() { setFetchKey((k) => k + 1); }
    window.addEventListener("cms-site-change", onSiteChange);
    return () => window.removeEventListener("cms-site-change", onSiteChange);
  }, []);

  useEffect(() => {
    setHasBuildCommand(false);
    setProfiles([]);
    setSelectedProfile(undefined);
    fetch("/api/admin/site-config/build-command")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.hasBuildCommand) {
          setHasBuildCommand(true);
          setProfiles(d.profiles ?? []);
          const defaultProfile = (d.profiles ?? []).find((p: BuildProfileInfo) => p.isDefault);
          setSelectedProfile(defaultProfile?.name);
        }
      })
      .catch(() => {});
  }, [fetchKey]);

  // "b" shortcut → open build panel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "b" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      if (!hasBuildCommand) return;
      e.preventDefault();
      setPanelOpen((o) => !o);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasBuildCommand]);

  if (!hasBuildCommand) return null;

  const hasMultipleProfiles = profiles.length > 1;

  return (
    <>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          title="Build (b)"
          aria-label="Build site"
          style={{
            background: "none",
            border: "1.5px solid var(--border)",
            cursor: "pointer",
            color: panelOpen ? "var(--foreground)" : "var(--muted-foreground)",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: hasMultipleProfiles ? "50% 0 0 50%" : "50%",
            width: "2rem", height: "2rem",
            padding: 0,
            borderRight: hasMultipleProfiles ? "none" : undefined,
          }}
          className="hover:border-foreground hover:text-foreground transition-colors"
        >
          <Hammer style={{ width: "0.9rem", height: "0.9rem" }} />
        </button>
        {hasMultipleProfiles && (
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            title="Select build profile"
            style={{
              background: "none",
              border: "1.5px solid var(--border)",
              borderLeft: "none",
              cursor: "pointer",
              color: "var(--muted-foreground)",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "0 50% 50% 0",
              width: "1.25rem", height: "2rem",
              padding: 0,
              fontSize: "0.55rem",
            }}
            className="hover:border-foreground hover:text-foreground transition-colors"
          >
            ▾
          </button>
        )}
        {/* Profile dropdown */}
        {dropdownOpen && hasMultipleProfiles && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "0.25rem",
              minWidth: "160px",
              zIndex: 50,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}
          >
            {profiles.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setSelectedProfile(p.name);
                  setDropdownOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.4rem 0.6rem",
                  fontSize: "0.75rem",
                  background: p.name === selectedProfile ? "var(--accent)" : "transparent",
                  color: "var(--foreground)",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                  fontWeight: p.name === selectedProfile ? 600 : 400,
                }}
              >
                <span>{p.name}</span>
                {p.isDefault && (
                  <span style={{ color: "var(--muted-foreground)", fontSize: "0.6rem", marginLeft: "0.4rem" }}>default</span>
                )}
                {p.description && (
                  <div style={{ color: "var(--muted-foreground)", fontSize: "0.6rem", marginTop: "0.1rem" }}>{p.description}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <BuildLogPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        profile={selectedProfile}
        profiles={profiles}
        onProfileChange={setSelectedProfile}
      />
    </>
  );
}

function PreviewButton() {
  const { siteConfig } = useHeaderData();
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [liveUrl, setLiveUrl] = useState<string>("");
  const [siteName, setSiteName] = useState("Site");
  const [previewDown, setPreviewDown] = useState(false);
  const [liveDown, setLiveDown] = useState(false);
  const { openTab } = useTabs();

  // Derive URLs from shared siteConfig + start sirv
  useEffect(() => {
    setPreviewUrl("");
    setLiveUrl("");
    setPreviewDown(false);
    setLiveDown(false);

    // Always try sirv preview server — works for all filesystem sites
    let customPreview = "";
    fetch("/api/preview-serve", { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { url?: string } | null) => {
        if (d?.url && !customPreview) setPreviewUrl(d.url);
      })
      .catch(() => {});

    if (siteConfig) {
      if (siteConfig.previewSiteUrl) {
        customPreview = siteConfig.previewSiteUrl as string;
        setPreviewUrl(customPreview);
        fetch(customPreview, { method: "HEAD", mode: "no-cors", signal: AbortSignal.timeout(8000) })
          .catch(() => setPreviewDown(true));
      }
      const live = siteConfig.deployCustomDomain
        ? `https://${siteConfig.deployCustomDomain}`
        : (siteConfig.deployProductionUrl as string) ?? "";
      setLiveUrl(live);
      if (siteConfig.siteName) setSiteName(siteConfig.siteName as string);
    }
  }, [siteConfig]);

  // Check live URL health separately
  useEffect(() => {
    if (!liveUrl) { setLiveDown(false); return; }
    fetch(liveUrl, { method: "HEAD", mode: "no-cors", signal: AbortSignal.timeout(8000) })
      .then(() => setLiveDown(false))
      .catch(() => setLiveDown(true));
  }, [liveUrl]);

  const openPreview = useCallback(async () => {
    // Preview is NEVER disabled — sirv is always available
    const isChatMode = localStorage.getItem("cms-admin-mode") === "chat";
    const open = (url: string) => {
      if (isChatMode) {
        window.open(url, "_blank");
      } else {
        openTab(previewPath(url), `Preview: ${siteName}`);
      }
    };

    if (previewUrl) {
      open(previewUrl);
    } else {
      try {
        const res = await fetch("/api/preview-serve", { method: "POST" });
        if (res.ok) {
          const { url } = await res.json() as { url: string };
          open(url);
        }
      } catch { /* ignore */ }
    }
  }, [previewUrl, siteName, openTab]);

  const openLive = useCallback(() => {
    if (liveUrl && !liveDown) window.open(liveUrl, "_blank");
  }, [liveUrl, liveDown]);

  // "p" = preview (always works), "l" = live site (may be down)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      if (e.key === "p") { e.preventDefault(); openPreview(); }
      if (e.key === "l" && liveUrl && !liveDown) { e.preventDefault(); openLive(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openPreview, openLive, liveUrl, liveDown]);

  // No live URL → simple preview button (NEVER disabled)
  if (!liveUrl) {
    return (
      <button
        type="button"
        onClick={openPreview}
        style={{
          background: "none", border: "1.5px solid var(--border)",
          cursor: "pointer",
          color: "var(--muted-foreground)", display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%", width: "2rem", height: "2rem", padding: 0,
        }}
        className="hover:border-foreground hover:text-foreground transition-colors"
        title="Preview site (p)"
        aria-label="Preview site"
      >
        <ExternalLink style={{ width: "0.9rem", height: "0.9rem" }} />
      </button>
    );
  }

  // Has live URL → dropdown with Preview (always works) + Live (may be down)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={{
          background: "none", border: "1.5px solid var(--border)",
          cursor: "pointer",
          color: "var(--muted-foreground)", display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%", width: "2rem", height: "2rem", padding: 0,
        }}
        className="hover:border-foreground hover:text-foreground transition-colors focus-visible:outline-none"
        title="Preview / Live site"
        aria-label="Preview or live site"
      >
        <ExternalLink style={{ width: "0.9rem", height: "0.9rem" }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ width: "200px" }}>
        <DropdownMenuItem onClick={openPreview}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Preview
          {previewDown && <span className="ml-auto text-xs text-yellow-500">sirv</span>}
          {!previewDown && <span className="ml-auto text-xs text-muted-foreground">p</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={openLive}
          disabled={liveDown}
          style={liveDown
            ? { opacity: 0.35, cursor: "not-allowed" }
            : { color: "rgb(74 222 128)" }}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Live site
          {liveDown
            ? <span className="ml-auto text-xs text-muted-foreground">down</span>
            : <span className="ml-auto text-xs text-muted-foreground">l</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModeToggle({ mode, onToggle }: { mode: AdminMode; onToggle: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        borderRadius: "6px",
        border: "1px solid var(--border)",
        padding: "2px",
        gap: "2px",
      }}
    >
      {([
        { value: "traditional" as const, label: "CMS", icon: LayoutDashboard },
        { value: "chat" as const, label: "Chat", icon: MessageSquare },
      ]).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          data-testid={`mode-toggle-${value}`}
          aria-label={`Switch to ${label} mode`}
          aria-pressed={mode === value}
          onClick={(e) => { e.stopPropagation(); if (mode !== value) onToggle(); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 10px",
            fontSize: "0.7rem",
            fontWeight: 500,
            borderRadius: "4px",
            border: "none",
            cursor: mode === value ? "default" : "pointer",
            transition: "all 150ms",
            background: mode === value ? "var(--primary)" : "transparent",
            color: mode === value ? "var(--primary-foreground)" : "var(--muted-foreground)",
          }}
        >
          <Icon style={{ width: "0.75rem", height: "0.75rem" }} />
          {label}
        </button>
      ))}
    </div>
  );
}

function LocaleIndicator() {
  const { siteConfig } = useHeaderData();
  const siteLocales = (siteConfig?.locales as string[] | undefined)?.length ?? 0 > 1
    ? (siteConfig!.locales as string[])
    : [];

  if (!siteLocales.length) return null;

  return (
    <span style={{
      fontSize: "0.65rem", color: "var(--muted-foreground)",
      display: "flex", alignItems: "center", gap: "0.2rem",
      padding: "0.15rem 0.4rem", borderRadius: "4px",
      border: "1px solid var(--border)",
    }}>
      <Languages style={{ width: "0.7rem", height: "0.7rem" }} />
      {siteLocales.map((l) => l.toUpperCase()).join(" \u00B7 ")}
    </span>
  );
}

interface AdminHeaderProps {
  mode?: AdminMode;
  onToggleMode?: () => void;
  onNewChat?: () => void;
  onToggleHistory?: () => void;
  showHistory?: boolean;
}

export function AdminHeader({ mode, onToggleMode, onNewChat, onToggleHistory, showHistory }: AdminHeaderProps = {}) {
  const { tabs, activeId } = useTabs();
  const activeTab = tabs.find((t) => t.id === activeId);
  const title = activeTab?.title;
  const { user: headerUser } = useHeaderData();
  const user: SessionUser | null = headerUser ? {
    id: headerUser.id,
    email: headerUser.email,
    name: headerUser.name,
    gravatarUrl: headerUser.gravatarUrl,
  } : null;

  return (
    <header style={{
      position: "sticky",
      top: 0,
      zIndex: 31,
      height: "48px",
      display: "flex",
      alignItems: "center",
      borderBottom: "1px solid var(--border)",
      backgroundColor: "var(--card)",
    }}>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: "0.5rem", padding: "0 1rem" }}>
        {mode !== "chat" && <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />}
        {mode === "chat" ? (
          <>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)" }}>
              Chat with your site
            </span>
            {onNewChat && (
              <button
                onClick={onNewChat}
                title="New conversation"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center", gap: "3px", fontSize: "0.75rem", marginLeft: "8px" }}
                className="hover:text-foreground hover:bg-muted transition-colors"
              >
                <Plus style={{ width: "14px", height: "14px" }} /> New
              </button>
            )}
            {onToggleHistory && (
              <button
                onClick={onToggleHistory}
                title="Conversation history"
                style={{ background: showHistory ? "var(--muted)" : "none", border: "none", cursor: "pointer", color: showHistory ? "var(--foreground)" : "var(--muted-foreground)", padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center", gap: "3px", fontSize: "0.75rem" }}
                className="hover:text-foreground hover:bg-muted transition-colors"
              >
                <History style={{ width: "14px", height: "14px" }} /> History
              </button>
            )}
          </>
        ) : title ? (
          <>
            <div style={{ width: "1px", height: "1rem", backgroundColor: "var(--border)", alignSelf: "center", margin: "0 0.125rem" }} />
            <span style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "320px" }}>
              {title}
            </span>
          </>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0 1rem" }}>
        {mode && onToggleMode && <ModeToggle mode={mode} onToggle={onToggleMode} />}
        <div style={{ width: "1px", height: "1rem", backgroundColor: "var(--border)" }} />
        <SiteSwitcher />
        <LocaleIndicator />
        <OrgSwitcher />
        <BuildButton />
        <BeamPill />
        <DeployButton />
        <PreviewButton />
        <HelpButton />
        <UserNav user={user} />
      </div>
    </header>
  );
}
