import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Admin UI runs standalone — no static export
  // CMS_CONFIG_PATH env var points to the project's cms.config.ts
  serverExternalPackages: ["better-sqlite3", "@webhouse/cms", "jiti"],
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
