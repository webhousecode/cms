import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Onboarding } from "./screens/Onboarding";
import { Login } from "./screens/Login";
import { Biometric } from "./screens/Biometric";
import { Home } from "./screens/Home";
import { getJwt, getServerUrl } from "./lib/prefs";
import { onDeepLink } from "./lib/bridge";
import { consumePairingDeepLink } from "./lib/pairing-flow";
import { Spinner } from "./components/Spinner";

/**
 * Top-level router + global deep link handler.
 *
 * Boot decision tree:
 * - No server URL set      → Onboarding
 * - Server set, no JWT     → Login
 * - JWT + biometric set    → Biometric (then Home)
 * - JWT + no biometric     → Home
 *
 * Deep links: ANY screen can receive a `webhouseapp://login?server=...&token=...`
 * URL. The handler runs at the App root so a brand-new install can be paired
 * by scanning a QR — no need to fill in the server URL manually first.
 */
export function App() {
  const [, setLocation] = useLocation();
  const [booted, setBooted] = useState(false);

  // Initial boot: figure out where to land
  useEffect(() => {
    void (async () => {
      const serverUrl = await getServerUrl();
      const jwt = await getJwt();

      if (!serverUrl) {
        setLocation("/onboarding");
      } else if (!jwt) {
        setLocation("/login");
      } else {
        // TODO Phase 1: check if biometric is enabled, route to /biometric if so
        setLocation("/home");
      }
      setBooted(true);
    })();
  }, [setLocation]);

  // Global deep link handler — runs from any screen, even Onboarding
  useEffect(() => {
    return onDeepLink(async (url) => {
      try {
        await consumePairingDeepLink(url);
        setLocation("/home");
      } catch (err) {
        console.error("Deep link pairing failed:", err);
        // Stay on current screen; the screen-level handler can show its own toast
      }
    });
  }, [setLocation]);

  if (!booted) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-dark">
        <Spinner />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/login" component={Login} />
      <Route path="/biometric" component={Biometric} />
      <Route path="/home" component={Home} />
      <Route>
        <div className="flex h-screen items-center justify-center bg-brand-dark text-white">
          <p>404 — unknown route</p>
        </div>
      </Route>
    </Switch>
  );
}
