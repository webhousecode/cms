import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker — self-contained server without node_modules
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@webhouse/cms", "jiti"],

  // F143: tsx + provided build deps are spawned at runtime via execFileSync /
  // child_process.spawn — Next.js's static import tracing doesn't see them and
  // tree-shakes them out of the standalone build. Force-include via
  // outputFileTracingIncludes so they survive into the standalone node_modules.
  outputFileTracingIncludes: {
    // Wildcard key applies to ALL routes; tracing ships the listed paths in
    // the standalone bundle. Patterns are glob, evaluated relative to
    // outputFileTracingRoot (defaults to the project root, which is the
    // monorepo root here).
    "*": [
      "../../node_modules/.pnpm/tsx@*/**",
      "../../node_modules/.pnpm/es-module-lexer@*/**",
      "../../node_modules/.pnpm/marked@*/**",
      "../../node_modules/.pnpm/marked-highlight@*/**",
      "../../node_modules/.pnpm/gray-matter@*/**",
      "../../node_modules/.pnpm/slugify@*/**",
      "../../node_modules/.pnpm/sharp@*/**",
    ],
  },

  // Serve /uploads/* via the dynamic API route which reads from UPLOAD_DIR.
  // This means uploaded files can live anywhere (e.g. the site's public dir)
  // and admin thumbnails still work.
  async redirects() {
    return [
      { source: "/login", destination: "/admin/login", permanent: false },
    ];
  },
  async rewrites() {
    return [
      { source: "/uploads/:path*", destination: "/api/uploads/:path*" },
      { source: "/images/:path*", destination: "/api/uploads/images/:path*" },
      { source: "/audio/:path*", destination: "/api/uploads/audio/:path*" },
      { source: "/interactives/:path*", destination: "/api/uploads/interactives/:path*" },
      { source: "/home", destination: "/home.html" },
    ];
  },
};

export default nextConfig;
