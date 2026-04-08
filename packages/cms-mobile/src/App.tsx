import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Onboarding } from "./screens/Onboarding";
import { Login } from "./screens/Login";
import { Biometric } from "./screens/Biometric";
import { Home } from "./screens/Home";
import { getServerUrl, getJwt } from "./lib/prefs";
import { Spinner } from "./components/Spinner";

/**
 * Top-level router.
 *
 * Boot decision tree:
 * - No server URL set      → Onboarding
 * - Server set, no JWT     → Login
 * - JWT + biometric set    → Biometric (then Home)
 * - JWT + no biometric     → Home
 */
export function App() {
  const [, setLocation] = useLocation();
  const [booted, setBooted] = useState(false);

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
