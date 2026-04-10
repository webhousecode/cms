"use client";

import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

/* ─── Server sync (debounced) ────────────────────────────────── */
let syncTimer: ReturnType<typeof setTimeout> | null = null;

let pendingSync: { tabs: Tab[]; activeId: string | null } | null = null;

function flushSync() {
  if (!pendingSync) return;
  const { tabs, activeId } = pendingSync;
  pendingSync = null;
  const blob = new Blob([JSON.stringify({ tabs, activeTabId: activeId })], { type: "application/json" });
  navigator.sendBeacon("/api/admin/user-state", blob);
}

function syncToServer(tabs: Tab[], activeId: string | null) {
  pendingSync = { tabs, activeId };
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    pendingSync = null;
    fetch("/api/admin/user-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabs, activeTabId: activeId }),
    }).catch(() => {});
  }, 500);
}

// Flush pending sync on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushSync);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSync();
  });
}

/* ─── Types ──────────────────────────────────────────────────── */
export type Tab = { id: string; path: string; title: string; status?: string };

type TabsCtx = {
  tabs: Tab[];
  activeId: string | null;
  openTab: (path: string, title?: string, forceNew?: boolean) => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  switchTab: (id: string) => void;
  setTabTitle: (title: string) => void;
  setTabStatus: (status: string) => void;
  updateTabStatusByPath: (path: string, status: string) => void;
};

/* ─── Helpers ────────────────────────────────────────────────── */
function uid() { return Math.random().toString(36).slice(2, 10); }

const PATH_TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/": "Dashboard",
  "/admin/media": "Media",
  "/admin/link-checker": "Link Checker",
  "/admin/curation": "Curation Queue",
  "/admin/agents": "AI Agents",
  "/admin/agents/new": "New Agent",
  "/admin/command": "Cockpit",
  "/admin/performance": "Performance",
  "/admin/settings": "Settings",
  "/admin/sites": "Sites",
  "/admin/scheduled": "Calendar",
  "/admin/interactives": "Interactives",
  "/admin/account": "Account",
  "/admin/trash": "Trash",
  "/admin/backup": "Backup",
  "/admin/forms": "Forms",
  "/admin/forms/builder": "Form Builder",
  "/admin/seo": "SEO",
  "/admin/lighthouse": "Lighthouse",
  "/admin/visibility": "Visibility",
  "/admin/ai-analytics": "AI Analytics",
  "/admin/favorites": "Favorites",
  "/admin/deploy/docker": "Docker Deploy",
};

function pathTitle(path: string): string {
  // Strip query params for lookup
  const bare = path.split("?")[0];
  if (PATH_TITLES[bare]) return PATH_TITLES[bare];
  const parts = bare.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return "Dashboard";
  return decodeURIComponent(parts[parts.length - 1]);
}

const STORE_KEY_BASE = "cms-admin-tabs-v4";

/** Per-user-per-site store key */
function storeKey(userId?: string | null, siteId?: string | null): string {
  if (userId && siteId) return `${STORE_KEY_BASE}:${userId}:${siteId}`;
  if (userId) return `${STORE_KEY_BASE}:${userId}`;
  return STORE_KEY_BASE;
}

function load(userId?: string | null, siteId?: string | null): { tabs: Tab[]; activeId: string | null } | null {
  try {
    const key = storeKey(userId, siteId);
    const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(tabs: Tab[], activeId: string | null, userId?: string | null, siteId?: string | null) {
  try { localStorage.setItem(storeKey(userId, siteId), JSON.stringify({ tabs, activeId })); } catch { /* noop */ }
  // NOT syncing to server — server user-state uses cookies which get
  // contaminated during site switches. localStorage with explicit siteId
  // in the key is the only reliable source of truth for tabs.
}

/* ─── Context ────────────────────────────────────────────────── */
const Ctx = createContext<TabsCtx | null>(null);

export function useTabs(): TabsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTabs used outside TabsProvider");
  return c;
}

/* ─── Provider ───────────────────────────────────────────────── */
export function TabsProvider({ children, siteId }: { children: ReactNode; siteId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Refs for synchronous read in callbacks (avoids stale closures + setState-in-render)
  const tabsRef = useRef<Tab[]>(tabs);
  const activeIdRef = useRef<string | null>(activeId);
  const userIdRef = useRef<string | null>(null);
  const siteIdRef = useRef<string | undefined>(siteId);
  const skipNextPathChange = useRef(false);

  function applyTabs(next: Tab[], nextActiveId: string | null) {
    tabsRef.current = next;
    activeIdRef.current = nextActiveId;
    setTabs(next);
    setActiveId(nextActiveId);
    save(next, nextActiveId, userIdRef.current, siteIdRef.current);
  }

  /* ── Fetch userId for per-user tab storage ────────────────── */
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { id?: string } }) => {
        const id = d.user?.id ?? null;
        setUserId(id);
        userIdRef.current = id;
      })
      .catch(() => {});
  }, []);

  /* ── Init: try server state → localStorage fallback → fresh start */
  useEffect(() => {
    if (userId === null) return; // wait for userId

    function restoreTabs(saved: { tabs: Tab[]; activeId: string | null } | null) {
      // Clear any switch flags (no longer needed — we never navigate on init)
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("org-switched");
        sessionStorage.removeItem("site-switched");
      }

      if (saved && saved.tabs.length > 0) {
        const migrated = saved.tabs.map((t) => ({
          ...t,
          title: PATH_TITLES[t.path.split("?")[0]] ?? t.title,
        }));
        const match = migrated.find((t) => t.path === pathname);
        if (match) {
          // Current URL matches a saved tab — activate it
          applyTabs(migrated, match.id);
        } else {
          // Current URL is not in saved tabs — add it as active tab
          // NEVER navigate away from the current URL on init
          const id = uid();
          const newTab = { id, path: pathname, title: pathTitle(pathname) };
          applyTabs([newTab, ...migrated], id);
        }
      } else {
        const id = uid();
        applyTabs([{ id, path: pathname, title: pathTitle(pathname) }], id);
      }
    }

    // localStorage ONLY — uses explicit siteId in key, always correct.
    // Server user-state is NOT used for tabs (cookie-based routing made it unreliable).
    restoreTabs(load(userId, siteId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* ── Reload tabs on site switch ───────────────────────────── */
  useEffect(() => {
    function handleSiteChange(e: Event) {
      const newSiteId = (e as CustomEvent).detail?.siteId as string | null;

      // 1. Save current site's tabs to localStorage ONLY.
      //    Do NOT call save() — it syncs to server via cookie, but the cookie
      //    is already set to the NEW site at this point (SiteSwitcher sets it
      //    before dispatching the event). That would contaminate the new site's
      //    server-side user-state with the old site's tabs.
      try {
        localStorage.setItem(
          storeKey(userIdRef.current, siteIdRef.current),
          JSON.stringify({ tabs: tabsRef.current, activeId: activeIdRef.current }),
        );
      } catch { /* noop */ }

      // 2. Now switch to new site
      siteIdRef.current = newSiteId ?? undefined;
      skipNextPathChange.current = true;

      // 3. Load new site's tabs from localStorage (synchronous, no race condition)
      const saved = load(userIdRef.current, newSiteId);
      if (saved && saved.tabs.length > 0) {
        const migrated = saved.tabs.map((t) => ({
          ...t,
          title: PATH_TITLES[t.path.split("?")[0]] ?? t.title,
        }));
        // Restore exact saved state: tabs + the active tab as it was
        const restoredActiveId = saved.activeId && migrated.some((t) => t.id === saved.activeId)
          ? saved.activeId
          : migrated[0].id;
        tabsRef.current = migrated;
        activeIdRef.current = restoredActiveId;
        setTabs(migrated);
        setActiveId(restoredActiveId);
        // Navigate to Dashboard after site switch — the restored tabs are for
        // browsing later, but the initial landing should always be Dashboard
        // to avoid navigating to a path that doesn't exist on the new site.
        skipNextPathChange.current = true;
        router.push("/admin");
      } else {
        // No saved tabs for this site — fresh Dashboard
        const id = uid();
        const fresh: Tab[] = [{ id, path: "/admin", title: "Dashboard" }];
        tabsRef.current = fresh;
        activeIdRef.current = id;
        setTabs(fresh);
        setActiveId(id);
        save(fresh, id, userIdRef.current, newSiteId);
      }
    }
    window.addEventListener("cms-site-change", handleSiteChange);

    // Reset tabs to a single tab (used by org-switch to multi-site)
    function handleTabsReset(e: Event) {
      const { path, title } = (e as CustomEvent).detail ?? {};
      if (!path) return;
      const id = `tab-${Date.now()}`;
      const fresh = [{ id, path, title: title ?? "Sites" }];
      setTabs(fresh);
      setActiveId(id);
      save(fresh, id, userIdRef.current, siteIdRef.current);
    }
    window.addEventListener("cms-tabs-reset", handleTabsReset);

    return () => {
      window.removeEventListener("cms-site-change", handleSiteChange);
      window.removeEventListener("cms-tabs-reset", handleTabsReset);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  /* ── Track normal navigation — update active tab's path ──── */
  useEffect(() => {
    if (skipNextPathChange.current) {
      skipNextPathChange.current = false;
      return;
    }
    const id = activeIdRef.current;
    const prev = tabsRef.current;
    if (!id || prev.length === 0) return;
    // For document paths (/admin/collection/slug), don't overwrite the title —
    // TabTitle in the page component sets the real document title via setTabTitle.
    // For shallow paths (collection lists, known routes), use pathTitle.
    const bare = pathname.split("?")[0];
    const parts = bare.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
    const isDocumentPath = parts.length >= 2;
    const updated = prev.map((t) =>
      t.id === id
        ? { ...t, path: pathname, title: isDocumentPath ? t.title : pathTitle(pathname) }
        : t
    );
    applyTabs(updated, id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /* ── Global ⌥W or "c" — close active tab ───────────────────── */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // ⌥W — always works
      if (e.altKey && e.code === "KeyW") {
        const id = activeIdRef.current;
        if (id) { e.preventDefault(); closeTab(id); }
        return;
      }
      // "c" — only when not in an editable field
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
        const id = activeIdRef.current;
        if (id) { e.preventDefault(); closeTab(id); }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Global ⌘⇧←/→ — switch between tabs ───────────────── */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      const prev = tabsRef.current;
      const currentId = activeIdRef.current;
      if (prev.length < 2 || !currentId) return;

      const idx = prev.findIndex((t) => t.id === currentId);
      if (idx === -1) return;

      let nextIdx: number;
      if (e.key === "ArrowLeft") {
        nextIdx = idx > 0 ? idx - 1 : prev.length - 1;
      } else {
        nextIdx = idx < prev.length - 1 ? idx + 1 : 0;
      }

      e.preventDefault();
      const target = prev[nextIdx];
      applyTabs(prev, target.id);
      skipNextPathChange.current = true;
      router.push(target.path);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  /* ── Global cmd+click / middle-click interceptor ─────────── */
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!e.metaKey && !e.ctrlKey && e.button !== 1) return;
      const anchor = (e.target as Element).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href?.startsWith("/admin")) return;
      e.preventDefault();
      e.stopPropagation();
      openTab(href);
    }
    document.addEventListener("click", handle, true);
    document.addEventListener("auxclick", handle, true);
    return () => {
      document.removeEventListener("click", handle, true);
      document.removeEventListener("auxclick", handle, true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── API ─────────────────────────────────────────────────── */
  const openTab = useCallback((path: string, title?: string, forceNew?: boolean) => {
    const prev = tabsRef.current;
    const existing = !forceNew && prev.find((t) => t.path === path);

    if (existing) {
      applyTabs(prev, existing.id);
      skipNextPathChange.current = true;
      router.push(path);
      return;
    }

    const id = uid();
    const tab: Tab = { id, path, title: title ?? pathTitle(path) };
    const next = [...prev, tab];
    applyTabs(next, id);
    skipNextPathChange.current = true;
    router.push(path);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const closeTab = useCallback((id: string) => {
    const prev = tabsRef.current;
    const idx = prev.findIndex((t) => t.id === id);
    const next = prev.filter((t) => t.id !== id);
    const currentActive = activeIdRef.current;

    if (id !== currentActive) {
      applyTabs(next, currentActive);
      return;
    }

    // Closed the active tab — switch to neighbour
    if (next.length === 0) {
      const id2 = uid();
      const dash: Tab = { id: id2, path: "/admin", title: "Dashboard" };
      applyTabs([dash], id2);
      skipNextPathChange.current = true;
      router.push("/admin");
      return;
    }

    const neighbour = next[Math.min(idx, next.length - 1)];
    applyTabs(next, neighbour.id);
    skipNextPathChange.current = true;
    router.push(neighbour.path);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const closeAllTabs = useCallback(() => {
    const id2 = uid();
    const dash: Tab = { id: id2, path: "/admin", title: "Dashboard" };
    applyTabs([dash], id2);
    skipNextPathChange.current = true;
    router.push("/admin");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const switchTab = useCallback((id: string) => {
    const prev = tabsRef.current;
    const tab = prev.find((t) => t.id === id);
    if (!tab || id === activeIdRef.current) return;
    applyTabs(prev, id);
    skipNextPathChange.current = true;
    router.push(tab.path);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const setTabTitle = useCallback((title: string) => {
    const id = activeIdRef.current;
    if (!id) return;
    const updated = tabsRef.current.map((t) => t.id === id ? { ...t, title } : t);
    applyTabs(updated, id);
  }, []);

  const setTabStatus = useCallback((status: string) => {
    const id = activeIdRef.current;
    if (!id) return;
    const updated = tabsRef.current.map((t) => t.id === id ? { ...t, status } : t);
    applyTabs(updated, id);
  }, []);

  const updateTabStatusByPath = useCallback((path: string, status: string) => {
    const updated = tabsRef.current.map((t) => t.path === path ? { ...t, status } : t);
    if (updated.some((t, i) => t !== tabsRef.current[i])) {
      applyTabs(updated, activeIdRef.current);
    }
  }, []);

  return (
    <Ctx.Provider value={{ tabs, activeId, openTab, closeTab, closeAllTabs, switchTab, setTabTitle, setTabStatus, updateTabStatusByPath }}>
      {children}
    </Ctx.Provider>
  );
}

/* ─── TabTitle — null component pages use to set their title ── */
export function TabTitle({ value }: { value: string }) {
  const { setTabTitle } = useTabs();
  useEffect(() => {
    if (value) setTabTitle(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return null;
}
