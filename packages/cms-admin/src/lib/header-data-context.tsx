"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

/** Shared data fetched once and used by all header components */
interface HeaderData {
  /** Current user from /api/auth/me */
  user: { id: string; email: string; name: string; role?: string; siteRole?: string; permissions?: string[]; gravatarUrl?: string; zoom?: number } | null;
  /** Site config from /api/admin/site-config */
  siteConfig: Record<string, unknown> | null;
  /** Whether data has loaded at least once */
  loaded: boolean;
  /** Re-fetch all data (e.g. on site change) */
  refresh: () => void;
}

const HeaderDataContext = createContext<HeaderData>({
  user: null,
  siteConfig: null,
  loaded: false,
  refresh: () => {},
});

export function useHeaderData() {
  return useContext(HeaderDataContext);
}

export function HeaderDataProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<HeaderData["user"]>(null);
  const [siteConfig, setSiteConfig] = useState<Record<string, unknown> | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.ok ? r.json() : null),
      fetch("/api/admin/site-config").then((r) => r.ok ? r.json() : null),
    ]).then(([meData, configData]) => {
      if (meData?.user) setUser(meData.user);
      if (configData) setSiteConfig(configData);
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
    <HeaderDataContext.Provider value={{ user, siteConfig, loaded, refresh }}>
      {children}
    </HeaderDataContext.Provider>
  );
}
