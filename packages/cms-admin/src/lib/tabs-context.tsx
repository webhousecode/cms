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
  "/admin/command": "AI Cockpit",
  "/admin/performance": "Performance",
  "/admin/settings": "Settings",
  "/admin/trash": "Trash",
};

function pathTitle(path: string): string {
  // Strip query params for lookup
  const bare = path.split("?")[0];
  if (PATH_TITLES[bare]) return PATH_TITLES[bare];
  const parts = bare.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return "Dashboard";
  return decodeURIComponent(parts[parts.length - 1]);
}

const STORE_KEY_BASE = "cms-admin-tabs-v1";

/** Per-user-per-site store key */
function storeKey(userId?: string | null): string {
  const siteId = typeof document !== "undefined"
    ? (document.cookie.match(/(?:^|; )cms-active-site=([^;]*)/)?.[1] ?? "")
    : "";
  if (userId && siteId) return `${STORE_KEY_BASE}:${userId}:${siteId}`;
  if (userId) return `${STORE_KEY_BASE}:${userId}`;
  return STORE_KEY_BASE;
}

function load(userId?: string | null): { tabs: Tab[]; activeId: string | null } | null {
  try {
    const key = storeKey(userId);
    const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(tabs: Tab[], activeId: string | null, userId?: string | null) {
  try { localStorage.setItem(storeKey(userId), JSON.stringify({ tabs, activeId })); } catch { /* noop */ }
  syncToServer(tabs, activeId);
}

/* ─── Context ────────────────────────────────────────────────── */
const Ctx = createContext<TabsCtx | null>(null);

export function useTabs(): TabsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTabs used outside TabsProvider");
  return c;
}

/* ─── Provider ───────────────────────────────────────────────── */
export function TabsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Refs for synchronous read in callbacks (avoids stale closures + setState-in-render)
  const tabsRef = useRef<Tab[]>(tabs);
  const activeIdRef = useRef<string | null>(activeId);
  const userIdRef = useRef<string | null>(null);
  const skipNextPathChange = useRef(false);

  function applyTabs(next: Tab[], nextActiveId: string | null) {
    tabsRef.current = next;
    activeIdRef.current = nextActiveId;
    setTabs(next);
    setActiveId(nextActiveId);
    save(next, nextActiveId, userIdRef.current);
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
      if (saved && saved.tabs.length > 0) {
        const migrated = saved.tabs.map((t) => ({
          ...t,
          title: PATH_TITLES[t.path.split("?")[0]] ?? t.title,
        }));
        const match = migrated.find((t) => t.path === pathname);
        if (match) {
          applyTabs(migrated, match.id);
        } else if (saved.activeId) {
          const activeTab = migrated.find((t) => t.id === saved.activeId);
          applyTabs(migrated, saved.activeId);
          if (activeTab && activeTab.path !== pathname) {
            skipNextPathChange.current = true;
            router.push(activeTab.path);
          }
        } else {
          applyTabs(migrated, saved.activeId);
        }
      } else {
        const id = uid();
        applyTabs([{ id, path: pathname, title: pathTitle(pathname) }], id);
      }
    }

    // Try server state first (survives cookie/localStorage clear)
    fetch("/api/admin/user-state")
      .then((r) => r.ok ? r.json() : null)
      .then((serverState) => {
        if (serverState?.tabs?.length > 0) {
          restoreTabs({ tabs: serverState.tabs, activeId: serverState.activeTabId });
        } else {
          // Fall back to localStorage (migration: seed server from localStorage)
          const local = load(userId);
          restoreTabs(local);
          if (local && local.tabs.length > 0) {
            // Seed server with localStorage data
            syncToServer(local.tabs, local.activeId);
          }
        }
      })
      .catch(() => {
        // Server unreachable — use localStorage
        restoreTabs(load(userId));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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

  /* ── Global ⌥W — close active tab ────────────────────────── */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.altKey && e.code === "KeyW") {
        const id = activeIdRef.current;
        if (id) { e.preventDefault(); closeTab(id); }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
