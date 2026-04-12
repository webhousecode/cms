import { useCallback, useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Onboarding } from "./screens/Onboarding";
import { Login } from "./screens/Login";
import { Biometric } from "./screens/Biometric";
import { Home } from "./screens/Home";
import { Site } from "./screens/Site";
import { SitePreviewFullscreen } from "./screens/SitePreviewFullscreen";
import { CollectionList } from "./screens/CollectionList";
import { DocumentList } from "./screens/DocumentList";
import { DocumentEditor } from "./screens/DocumentEditor";
import { MediaBrowser } from "./screens/MediaBrowser";
import { Chat } from "./screens/Chat";
import { Settings } from "./screens/Settings";
import { ChatFab } from "./components/ChatFab";
import { NavigationStack } from "./components/NavigationStack";
import { RefreshIndicator } from "./components/RefreshIndicator";
import { getJwt, getServerUrl } from "./lib/prefs";
import { onDeepLink } from "./lib/bridge";
import { consumePairingDeepLink } from "./lib/pairing-flow";
import { usePullToRefresh } from "./lib/use-pull-to-refresh";


export function App() {
  const [location, setLocation] = useLocation();
  const [booted, setBooted] = useState(false);

  // Native pull-to-refresh: listen for iOS UIRefreshControl / Android SwipeRefreshLayout
  usePullToRefresh();

  // Initial boot: figure out where to land (minimum 2s splash)
  useEffect(() => {
    void (async () => {
      const splashStart = Date.now();
      const serverUrl = await getServerUrl();
      const jwt = await getJwt();
      if (!serverUrl) {
        setLocation("/onboarding");
      } else if (!jwt) {
        setLocation("/login");
      } else {
        // Check for default site — skip home, go straight to site page
        const { getDefaultSite } = await import("./lib/prefs");
        const def = await getDefaultSite();
        if (def) {
          setLocation(`/site/${def.orgId}/${def.siteId}`);
        } else {
          setLocation("/home");
        }
      }
      const elapsed = Date.now() - splashStart;
      const remaining = Math.max(0, 2000 - elapsed);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
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
      <div className="relative flex h-screen items-center justify-center bg-brand-dark overflow-hidden">
        <style>{`
          @keyframes eye-bounce {
            0% { transform: scale(0.8); opacity: 0; }
            40% { transform: scale(1.05); opacity: 1; }
            60% { transform: scale(0.97); }
            80% { transform: scale(1.02); }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes glow-pulse {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
          }
          .eye-splash { animation: eye-bounce 0.8s ease-out forwards; }
          .glow-pulse { animation: glow-pulse 2.4s ease-in-out infinite; }
        `}</style>
        {/* Grid background — engineering blueprint */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: "64px 64px",
          }}
        />
        {/* Gold glow behind eye — illumination */}
        <div
          className="absolute glow-pulse rounded-full pointer-events-none"
          style={{
            width: "60vw",
            height: "60vw",
            maxWidth: "300px",
            maxHeight: "300px",
            background: "radial-gradient(circle, rgba(247,187,46,0.25) 0%, rgba(247,187,46,0.08) 40%, transparent 70%)",
          }}
        />
        {/* Eye logo */}
        <img
          src="/webhouse-eye.svg"
          alt=""
          className="eye-splash relative z-10"
          style={{ width: "44vw", maxWidth: "200px" }}
        />
      </div>
    );
  }

  // Is the user on a "child" screen that can swipe back to Home?
  const isChildOfHome =
    (location.startsWith("/site/") && !location.endsWith("/preview")) ||
    location === "/settings" ||
    location === "/chat";

  // Content editing screens get their own back-navigation (no swipe to Home)
  const isContentScreen =
    location.includes("/collections") || location.includes("/edit/") || location.includes("/media");

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

      {isContentScreen ? (
        // Content editing screens — no swipe-to-Home (they have their own back nav)
        <Switch>
          <Route path="/site/:orgId/:siteId/collections/:collection" component={DocumentList} />
          <Route path="/site/:orgId/:siteId/collections" component={CollectionList} />
          <Route path="/site/:orgId/:siteId/edit/:collection/:slug" component={DocumentEditor} />
          <Route path="/site/:orgId/:siteId/media" component={MediaBrowser} />
        </Switch>
      ) : isChildOfHome ? (
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
  // Hide FAB on content editing screens (collections, doc list, editor) and preview
  const isContentEditing = location.includes("/collections") || location.includes("/edit/");
  const showFab =
    !isContentEditing &&
    (location.startsWith("/site/") && !location.endsWith("/preview"));
  if (!showFab) return null;
  return <ChatFab />;
}
