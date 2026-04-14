import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker — self-contained server without node_modules
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@webhouse/cms", "jiti"],
  // Serve /uploads/* via the dynamic API route which reads from UPLOAD_DIR.
  // This means uploaded files can live anywhere (e.g. the site's public dir)
  // and admin thumbnails still work.
  async redirects() {
    return [
      { source: "/login", destination: "/admin/login", permanent: false },
    ];
  },
  // HSTS — after first HTTPS visit, Chrome auto-upgrades future http://localhost:3010
  // requests to https:// (no more ERR_EMPTY_RESPONSE when typing "localhost:3010").
  // 1-year max-age, includeSubDomains for completeness.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
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
