import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { getMe } from "@/api/client";
import { clearAllAuth, getServerUrl } from "@/lib/prefs";
import { clearBiometricJwt } from "@/lib/bridge";

/**
 * Phase 1 Home placeholder.
 *
 * Proves the architecture works end-to-end:
 *  - JWT in storage
 *  - Bearer auth on outgoing requests
 *  - Typed API client returning real data
 *  - Multi-tenant org/site list rendering
 *
 * Real dashboard arrives in Phase 4.
 */
export function Home() {
  const [, setLocation] = useLocation();

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  const serverQuery = useQuery({
    queryKey: ["serverUrl"],
    queryFn: getServerUrl,
  });

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
      <Screen className="px-6">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
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

  return (
    <Screen className="px-6">
      <header className="flex items-center gap-3 py-6">
        {me.user.avatarUrl ? (
          <img
            src={me.user.avatarUrl}
            alt=""
            className="h-12 w-12 rounded-full border border-white/10"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold text-brand-dark text-lg font-semibold">
            {me.user.name?.[0] ?? me.user.email[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <p className="text-base font-medium">{me.user.name ?? me.user.email}</p>
          <p className="text-xs text-white/50">{serverQuery.data}</p>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <div className="rounded-xl bg-brand-darkSoft p-4">
          <p className="text-xs uppercase text-white/40">Curation queue</p>
          <p className="mt-1 text-2xl font-semibold text-brand-gold">
            {me.counters.curationPending}
          </p>
          <p className="mt-1 text-xs text-white/50">
            Coming in Phase 3 — swipe to approve
          </p>
        </div>

        <div className="rounded-xl bg-brand-darkSoft p-4">
          <p className="text-xs uppercase text-white/40">Your sites</p>
          <ul className="mt-2 flex flex-col gap-2">
            {me.sites.map((site) => (
              <li
                key={`${site.orgId}-${site.siteId}`}
                className="flex items-center justify-between rounded-lg bg-brand-darkPanel p-3"
              >
                <div>
                  <p className="text-sm font-medium">{site.siteName}</p>
                  <p className="text-xs text-white/50">{site.orgName}</p>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                  {site.role}
                </span>
              </li>
            ))}
            {me.sites.length === 0 && (
              <li className="text-sm text-white/50">No sites yet</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-dashed border-white/10 p-4">
          <p className="text-xs text-white/40">
            Phase 1 placeholder — Dashboard arrives in Phase 4
          </p>
        </div>
      </section>

      <footer className="mt-auto py-6">
        <Button variant="secondary" onClick={handleLogout} className="w-full">
          Sign out
        </Button>
      </footer>
    </Screen>
  );
}
