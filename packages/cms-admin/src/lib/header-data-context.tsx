"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

/** Shared data fetched once and used by all workspace components */
interface HeaderData {
  /** Current user from /api/auth/me */
  user: { id: string; email: string; name: string; role?: string; siteRole?: string; permissions?: string[]; gravatarUrl?: string; zoom?: number } | null;
  /** Site config from /api/admin/site-config */
  siteConfig: Record<string, unknown> | null;
  /** User profile from /api/admin/profile */
  profile: { lastActiveSite?: string; lastActiveOrg?: string; pinnedSidebar?: string[]; collapsedSidebar?: string[] } | null;
  /** F138: registry exists but every org has 0 sites — drives empty-admin UX */
  isAdminEmpty: boolean;
  /** Whether data has loaded at least once */
  loaded: boolean;
  /** Re-fetch all data (e.g. on site change) */
  refresh: () => void;
}

const HeaderDataContext = createContext<HeaderData>({
  user: null,
  siteConfig: null,
  profile: null,
  isAdminEmpty: false,
  loaded: false,
  refresh: () => {},
});

export function useHeaderData() {
  return useContext(HeaderDataContext);
}

export function HeaderDataProvider({
  children,
  initialIsAdminEmpty = false,
}: {
  children: ReactNode;
  /**
   * Server-rendered seed value for `isAdminEmpty`. Without this, the first
   * paint defaults to `false` and any empty-state UI (sidebar gating in
   * F138) flashes the FULL menu before the client-side fetch lands. Layout
   * server-component computes this and passes it down → no FOUC.
   */
  initialIsAdminEmpty?: boolean;
}) {
  const [user, setUser] = useState<HeaderData["user"]>(null);
  const [siteConfig, setSiteConfig] = useState<Record<string, unknown> | null>(null);
  const [profile, setProfile] = useState<HeaderData["profile"]>(null);
  const [isAdminEmpty, setIsAdminEmpty] = useState(initialIsAdminEmpty);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.ok ? r.json() : null),
      fetch("/api/admin/site-config").then((r) => r.ok ? r.json() : null),
      fetch("/api/admin/profile").then((r) => r.ok ? r.json() : null),
      fetch("/api/admin/state").then((r) => r.ok ? r.json() : null),
    ]).then(([meData, configData, profileData, stateData]) => {
      if (meData?.user) setUser(meData.user);
      if (configData) setSiteConfig(configData);
      if (profileData) setProfile(profileData);
      if (stateData) setIsAdminEmpty(Boolean(stateData.isEmpty));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();

    // Re-fetch on site change
    function onSiteChange() { refresh(); }
    window.addEventListener("cms-site-change", onSiteChange);
    window.addEventListener("cms:site-config-updated", onSiteChange);
    return () => {
      window.removeEventListener("cms-site-change", onSiteChange);
      window.removeEventListener("cms:site-config-updated", onSiteChange);
    };
  }, [refresh]);

  return (
    <HeaderDataContext.Provider value={{ user, siteConfig, profile, isAdminEmpty, loaded, refresh }}>
      {children}
    </HeaderDataContext.Provider>
  );
}
