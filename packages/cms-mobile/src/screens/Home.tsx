import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, HeaderAvatar } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { getMe } from "@/api/client";
import type { MobileSite } from "@/api/types";
import {
  clearAllAuth,
  getActiveOrgId,
  getServerUrl,
  setActiveOrgId,
} from "@/lib/prefs";
import { clearBiometricJwt, registerPendingPushToken } from "@/lib/bridge";

/**
 * Phase 1 Home placeholder.
 *
 * Proves the architecture works end-to-end:
 *  - JWT in storage
 *  - Bearer auth on outgoing requests
 *  - Typed API client returning real data
 *  - Multi-tenant org/site list with active-org selector
 *
 * Real dashboard arrives in Phase 4.
 */

interface OrgGroup {
  orgId: string;
  orgName: string;
  sites: MobileSite[];
}

function groupByOrg(sites: MobileSite[]): OrgGroup[] {
  const map = new Map<string, OrgGroup>();
  for (const site of sites) {
    let group = map.get(site.orgId);
    if (!group) {
      group = { orgId: site.orgId, orgName: site.orgName, sites: [] };
      map.set(site.orgId, group);
    }
    group.sites.push(site);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.orgName.localeCompare(b.orgName, undefined, { sensitivity: "base" }),
  );
}

export function Home() {
  const [, setLocation] = useLocation();
  const [activeOrg, setActiveOrgState] = useState<string | null>(null);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [siteSearch, setSiteSearch] = useState("");
  const orgDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside tap
  useEffect(() => {
    if (!orgDropdownOpen) return;
    function onTap(e: MouseEvent | TouchEvent) {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onTap);
    document.addEventListener("touchstart", onTap);
    return () => {
      document.removeEventListener("mousedown", onTap);
      document.removeEventListener("touchstart", onTap);
    };
  }, [orgDropdownOpen]);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });


  const serverQuery = useQuery({
    queryKey: ["serverUrl"],
    queryFn: getServerUrl,
  });

  // Group sites once per data change
  const orgs = useMemo<OrgGroup[]>(
    () => (meQuery.data ? groupByOrg(meQuery.data.sites) : []),
    [meQuery.data],
  );

  // Phase 2: try to flush any pending FCM/APNs token to the server now
  // that we definitely have a JWT. No-op if no token yet — the bridge
  // listener will retry on its own.
  useEffect(() => {
    void registerPendingPushToken().catch((err) => {
      console.warn("Push token register failed (will retry):", err);
    });
  }, []);

  // Pick the initial active org: stored pref → user.lastActiveOrg → first org
  useEffect(() => {
    if (!meQuery.data || activeOrg) return;
    void (async () => {
      const stored = await getActiveOrgId();
      const fromServer = meQuery.data?.lastActiveOrg ?? null;
      const fallback = orgs[0]?.orgId ?? null;
      const candidate = stored ?? fromServer ?? fallback;
      if (candidate && orgs.some((o) => o.orgId === candidate)) {
        setActiveOrgState(candidate);
      } else if (fallback) {
        setActiveOrgState(fallback);
      }
    })();
  }, [meQuery.data, orgs, activeOrg]);

  async function handleSelectOrg(orgId: string) {
    setActiveOrgState(orgId);
    setOrgDropdownOpen(false);
    await setActiveOrgId(orgId);
  }

  async function handleLogout() {
    await clearAllAuth();
    await clearBiometricJwt();
    setLocation("/login");
  }

  if (meQuery.isLoading) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      </Screen>
    );
  }

  if (meQuery.isError) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <p className="text-red-400">Could not load your account</p>
          <p className="text-sm text-white/60">{(meQuery.error as Error).message}</p>
          <Button onClick={() => meQuery.refetch()}>Retry</Button>
          <Button variant="ghost" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </Screen>
    );
  }

  const me = meQuery.data!;
  const visibleOrg = orgs.find((o) => o.orgId === activeOrg) ?? orgs[0];
  const allVisibleSites = visibleOrg?.sites ?? [];
  const visibleSites = siteSearch.trim()
    ? allVisibleSites.filter((s) =>
        s.siteName.toLowerCase().includes(siteSearch.toLowerCase()),
      )
    : allVisibleSites;

  return (
    <Screen>
      <ScreenHeader
        left={
          <button
            type="button"
            onClick={() => setLocation("/settings")}
            className="rounded-full active:scale-95 transition-transform"
            aria-label="Open settings"
          >
            <HeaderAvatar
              name={me.user.name ?? me.user.email}
              email={me.user.email}
              src={me.user.avatarUrl ?? undefined}
            />
          </button>
        }
        title={me.user.name ?? me.user.email}
        subtitle={serverQuery.data ?? undefined}
      />

      <div className="flex flex-1 flex-col px-6 pb-24 overflow-auto">
      {/* Org selector — single trigger button + custom dropdown.
          Saves vertical space and scales to many orgs without scrolling. */}
      {orgs.length > 0 && visibleOrg && (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase text-white/40 tracking-wider">
            Organization
          </p>
          <div ref={orgDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setOrgDropdownOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl bg-brand-darkSoft border border-white/10 px-4 py-3 text-left hover:border-white/30"
              aria-expanded={orgDropdownOpen}
              aria-haspopup="listbox"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-base font-medium truncate">
                  {visibleOrg.orgName}
                </span>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                  {visibleOrg.sites.length}
                </span>
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className={`shrink-0 ml-2 text-white/60 transition-transform ${
                  orgDropdownOpen ? "rotate-180" : ""
                }`}
              >
                <path
                  d="M4 6l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {orgDropdownOpen && (
              <>
              {/* Glass overlay dims + blurs content below the dropdown */}
              <div
                className="fixed inset-0 z-[5]"
                style={{ backgroundColor: "rgba(13,13,13,0.5)", WebkitBackdropFilter: "blur(8px)", backdropFilter: "blur(8px)" }}
                onClick={() => setOrgDropdownOpen(false)}
                aria-hidden
              />
              <ul
                role="listbox"
                className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-xl border border-white/10 bg-brand-darkPanel shadow-xl"
              >
                {orgs.map((org) => {
                  const isActive = org.orgId === visibleOrg.orgId;
                  return (
                    <li key={org.orgId} role="option" aria-selected={isActive}>
                      <button
                        type="button"
                        onClick={() => handleSelectOrg(org.orgId)}
                        className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-white/5 ${
                          isActive ? "text-brand-gold" : "text-white/90"
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {isActive && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 16 16"
                              fill="none"
                              className="shrink-0"
                            >
                              <path
                                d="M3 8l3.5 3.5L13 5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                          <span className={`truncate ${isActive ? "" : "ml-[18px]"}`}>
                            {org.orgName}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                          {org.sites.length}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3 mt-4">
        <div className="rounded-xl bg-brand-darkSoft p-4">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs uppercase text-white/40">Sites</p>
            <p className="text-xs text-white/40">
              {siteSearch.trim()
                ? `${visibleSites.length} / ${allVisibleSites.length}`
                : visibleSites.length}
            </p>
          </div>
          {/* Type-ahead search — shown when org has 4+ sites */}
          {allVisibleSites.length >= 4 && (
            <div className="relative mb-3">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              >
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Search sites..."
                value={siteSearch}
                onChange={(e) => setSiteSearch(e.target.value)}
                className="w-full rounded-lg bg-brand-darkPanel border border-white/10 py-2 pl-9 pr-8 text-sm text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none"
              />
              {siteSearch && (
                <button
                  type="button"
                  onClick={() => setSiteSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  aria-label="Clear search"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          )}
          <ul className="mt-2 flex flex-col gap-2">
            {visibleSites.map((site) => (
              <li key={`${site.orgId}-${site.siteId}`}>
                <button
                  type="button"
                  onClick={() => setLocation(`/site/${site.orgId}/${site.siteId}`)}
                  className="flex w-full items-center justify-between rounded-lg bg-brand-darkPanel p-3 text-left hover:bg-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{site.siteName}</p>
                  </div>
                  <div className="ml-3 flex items-center gap-1 shrink-0">
                    {site.liveUrl && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-green-500/20 text-green-400">LIVE</span>
                    )}
                    {site.adapter === "github" ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-white/10 text-white/50">GITHUB</span>
                    ) : (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-white/10 text-white/50">LOCAL</span>
                    )}
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="ml-2 text-white/40"
                  >
                    <path
                      d="M6 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
            {visibleSites.length === 0 && (
              <li className="text-sm text-white/50">No sites in this org</li>
            )}
          </ul>
        </div>
      </section>

      {/* Sign out moved to Settings — avatar tap → Settings → Sign out */}
      </div>
    </Screen>
  );
}
