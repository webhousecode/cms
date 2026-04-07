/**
 * PM2 ecosystem config — local dev server pool for @webhouse/cms test sites.
 *
 * What PM2 manages: Next.js sites that need long-running dev servers with HMR.
 * What PM2 does NOT manage: static sites (examples/static/*, examples/landing,
 *   examples/blog, maurseth). Those are served on-demand by CMS admin via sirv
 *   from each site's dist/ directory — see api/preview-serve/route.ts.
 *
 * Usage:
 *   bash scripts/pm2-pool.sh up       # start pool (kills conflicting standalone servers first)
 *   bash scripts/pm2-pool.sh down     # stop + delete pool
 *   bash scripts/pm2-pool.sh status
 *   bash scripts/pm2-pool.sh logs [site]
 *
 * Or directly:
 *   pnpm dlx pm2 start ecosystem.config.js
 *   pnpm dlx pm2 list
 *   pnpm dlx pm2 logs cms-docs
 *
 * ⚠️  PORT 3010 IS RESERVED for the CMS admin dev server and must NEVER appear here.
 *
 * Note: We invoke `next` directly (not via `pnpm dev`) so PM2 manages the actual
 * Next.js process. With a pnpm wrapper, if Next crashes the wrapper survives as a
 * zombie and PM2 never restarts it.
 */

const nextSite = (name, cwd, port) => ({
  name,
  cwd,
  // Invoke Next.js's JS entry directly so PM2 manages the actual Node process,
  // avoiding the pnpm/npm wrapper zombie problem.
  script: "node_modules/next/dist/bin/next",
  args: "dev",
  interpreter: "node",
  env: { PORT: String(port), NODE_ENV: "development" },
  autorestart: true,
  watch: false,
  max_memory_restart: "1G",
  time: true,
  listen_timeout: 15000,
  kill_timeout: 5000,
});

// Production build of cms-admin (Next.js standalone) for performance testing.
// Uses port 4010. Shares _data with dev (CMS_CONFIG_PATH from .env.local).
// Build via: bash scripts/build-cms-admin-prod.sh
const CMS_ADMIN_DIR = "/Users/cb/Apps/webhouse/cms/packages/cms-admin";
const cmsAdminProd = {
  name: "cms-admin-prod",
  cwd: `${CMS_ADMIN_DIR}/.next/standalone/packages/cms-admin`,
  script: "server.js",
  interpreter: "node",
  env: {
    PORT: "4010",
    HOSTNAME: "0.0.0.0",
    NODE_ENV: "production",
  },
  autorestart: true,
  watch: false,
  max_memory_restart: "1G",
  time: true,
  listen_timeout: 15000,
  kill_timeout: 5000,
};

module.exports = {
  apps: [
    nextSite("webhouse-site", "/Users/cb/Apps/webhouse/webhouse-site", 3009),
    nextSite("cms-docs",      "/Users/cb/Apps/webhouse/cms-docs",      3036),
    nextSite("sproutlake",    "/Users/cb/Apps/cbroberg/sproutlake",    3002),
    cmsAdminProd,
  ],
};
