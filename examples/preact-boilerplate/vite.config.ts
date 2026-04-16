import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [preact({ prerender: { enabled: true, renderTarget: "#app" } }), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "~content": fileURLToPath(new URL("./content", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
