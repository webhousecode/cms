import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Vite config for the webhouse.app mobile shell.
// Output goes to dist/ which Capacitor's webDir points at.
// No dev server proxy — the app talks directly to the user's CMS server URL.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Smaller bundle = faster app launch + smaller IPA.
    // Code-splitting per screen happens automatically via dynamic imports.
    target: "es2022",
    minify: "esbuild",
    sourcemap: true,
  },
  server: {
    port: 5180,
    strictPort: true,
  },
});
