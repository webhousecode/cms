import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Admin UI runs standalone — no static export
  // CMS_CONFIG_PATH env var points to the project's cms.config.ts
  serverExternalPackages: ["better-sqlite3", "@webhouse/cms", "jiti"],
  // Exclude site content/build directories from file watching.
  // Without this, preview-build writing to dist/ triggers Fast Refresh
  // which remounts the editor and causes content loss.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          ...(Array.isArray(config.watchOptions?.ignored) ? config.watchOptions.ignored : config.watchOptions?.ignored ? [config.watchOptions.ignored] : []),
          "**/dist/**",
          "**/deploy/**",
          "**/_revisions/**",
          "**/node_modules/**",
        ],
      };
    }
    return config;
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
