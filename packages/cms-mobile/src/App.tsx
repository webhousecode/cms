import { useCallback, useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Onboarding } from "./screens/Onboarding";
import { Login } from "./screens/Login";
import { Biometric } from "./screens/Biometric";
import { Home } from "./screens/Home";
import { Site } from "./screens/Site";
import { SitePreviewFullscreen } from "./screens/SitePreviewFullscreen";
import { Chat } from "./screens/Chat";
import { Settings } from "./screens/Settings";
import { ChatFab } from "./components/ChatFab";
import { NavigationStack } from "./components/NavigationStack";
import { RefreshIndicator } from "./components/RefreshIndicator";
import { getJwt, getServerUrl } from "./lib/prefs";
import { onDeepLink } from "./lib/bridge";
import { consumePairingDeepLink } from "./lib/pairing-flow";
import { usePullToRefresh } from "./lib/use-pull-to-refresh";
import { Spinner } from "./components/Spinner";

export function App() {
  const [location, setLocation] = useLocation();
  const [booted, setBooted] = useState(false);

  // Native pull-to-refresh: listen for iOS UIRefreshControl / Android SwipeRefreshLayout
  usePullToRefresh();

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
        setLocation("/home");
      }
      setBooted(true);
    })();
  }, [setLocation]);

  // Global deep link handler
  useEffect(() => {
    return onDeepLink(async (url) => {
      try {
        await consumePairingDeepLink(url);
        setLocation("/home");
      } catch (err) {
        console.error("Deep link pairing failed:", err);
      }
    });
  }, [setLocation]);

  const goHome = useCallback(() => setLocation("/home"), [setLocation]);

  if (!booted) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-dark">
        <Spinner />
      </div>
    );
  }

  // Is the user on a "child" screen that can swipe back to Home?
  const isChildOfHome =
    (location.startsWith("/site/") && !location.endsWith("/preview")) ||
    location === "/settings" ||
    location === "/chat";

  // Non-authenticated screens
  if (
    location === "/onboarding" ||
    location === "/login" ||
    location === "/biometric"
  ) {
    return (
      <Switch>
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/login" component={Login} />
        <Route path="/biometric" component={Biometric} />
      </Switch>
    );
  }

  // Fullscreen preview — no swipe-back, no FAB
  if (location.endsWith("/preview")) {
    return (
      <Route path="/site/:orgId/:siteId/preview" component={SitePreviewFullscreen} />
    );
  }

  // Authenticated screens with navigation stack
  return (
    <>
      <RefreshIndicator />

      {isChildOfHome ? (
        // Child screen on top of Home with swipe-back
        <NavigationStack backScreen={<Home />} onBack={goHome}>
          <Switch>
            <Route path="/site/:orgId/:siteId" component={Site} />
            <Route path="/settings" component={Settings} />
            <Route path="/chat" component={Chat} />
          </Switch>
        </NavigationStack>
      ) : (
        // Home screen
        <Home />
      )}

      <FabGate />
    </>
  );
}

function FabGate() {
  const [location] = useLocation();
  const showFab =
    location.startsWith("/home") ||
    location.startsWith("/settings") ||
    (location.startsWith("/site/") && !location.endsWith("/preview"));
  if (!showFab) return null;
  return <ChatFab />;
}
