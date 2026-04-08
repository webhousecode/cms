import type { CapacitorConfig } from "@capacitor/cli";

// webhouse.app — first-class native mobile shell.
//
// IMPORTANT: NO `server.url` is set. The app loads its bundled Vite output
// from `webDir` and talks to the user's CMS server via JSON API only.
// This is intentional and matches the BYO-server-URL architecture
// documented in docs/features/F07-mobile-cocpit-master-plan.md.
const config: CapacitorConfig = {
  appId: "app.webhouse.cms",
  appName: "webhouse.app",
  webDir: "dist",
  backgroundColor: "#0D0D0D",

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0D0D0D",
      showSpinner: false,
      splashImmersive: true,
      splashFullScreen: true,
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#0D0D0D",
    },
  },

  ios: {
    contentInset: "never",
    allowsLinkPreview: false,
    scrollEnabled: true,
    // Required so the app can talk to https://localhost:3010 in dev (mkcert cert)
    limitsNavigationsToAppBoundDomains: false,
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
