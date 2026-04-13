import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "path";
import sirv from "sirv";

/**
 * Starts (or reuses) a lightweight static file server for the active site's dist/ directory.
 * Returns the URL the preview iframe should load.
 *
 * POST /api/preview-serve
 * Returns: { url: "http://localhost:<port>" }
 */

// Track running servers per site: siteId → { server, port }
const activeServers = new Map<string, { server: Server; port: number }>();

// Clean up sirv servers on process exit so ports are freed before PM2 restart
function shutdownServers() {
  for (const [id, { server }] of activeServers) {
    try { server.close(); } catch { /* best effort */ }
  }
  activeServers.clear();
}
process.on("SIGINT", shutdownServers);
process.on("SIGTERM", shutdownServers);

async function findFreePort(): Promise<number> {
  // Try Code Launcher first
  try {
    const res = await fetch("https://cl.broberg.dk/api/vacant-port");
    if (res.ok) {
      const data = await res.json() as { port: number };
      return data.port;
    }
  } catch { /* fall through */ }

  // Fallback: let OS pick
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, () => {
      const addr = s.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        s.close(() => resolve(port));
      } else {
        reject(new Error("Could not get port"));
      }
    });
  });
}

export async function POST(req: NextRequest) {
  const sitePaths = await getActiveSitePaths();
  const distDir = path.join(sitePaths.projectDir, "dist");

  if (!existsSync(distDir)) {
    return NextResponse.json(
      { error: `No dist/ directory found at ${distDir}. Run the site's build first.` },
      { status: 404 },
    );
  }

  const siteId = distDir;

  // Check for fresh=true param (restarts server to pick up new dist/ files + 404)
  const fresh = req.nextUrl?.searchParams?.get("fresh") === "true";

  // Reuse existing server if still running
  const existing = activeServers.get(siteId);
  if (existing && !fresh) {
    try {
      const check = await fetch(`http://localhost:${existing.port}/`, { signal: AbortSignal.timeout(500) });
      if (check.ok) {
        return NextResponse.json({ url: `http://localhost:${existing.port}` });
      }
    } catch { /* server died, start new one */ }
    activeServers.delete(siteId);
  }
  // Kill old server if restarting fresh
  if (existing && fresh) {
    try { existing.server.close(); } catch { /* ignore */ }
    activeServers.delete(siteId);
  }

  const port = await findFreePort();

  const handler = sirv(distDir, {
    single: false,
    etag: true,
    gzip: true,
    dev: true,    // no caching in dev
  });

  // Load custom 404 page from @webhouse/cms static assets
  let custom404 = "<h1>404 — Not Found</h1>";
  try {
    // Try site's own dist/404.html first, then CMS bundled 404
    const site404 = path.join(distDir, "404.html");
    if (existsSync(site404)) {
      custom404 = readFileSync(site404, "utf-8");
    } else {
      // Try multiple resolution strategies for the CMS 404 page
      const candidates = [
        // Monorepo sibling package
        path.resolve(process.cwd(), "..", "cms", "static", "404.html"),
        // npm installed
        path.resolve(process.cwd(), "node_modules", "@webhouse", "cms", "static", "404.html"),
      ];
      // Note: previously tried require.resolve("@webhouse/cms/package.json")
      // here as another candidate, but Turbopack's static analysis flags it
      // as Module not found at build time even inside try/catch. The
      // hardcoded candidates above (monorepo symlink + npm installed) cover
      // the same paths at runtime, so this is safe to omit.

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          custom404 = readFileSync(candidate, "utf-8");
          break;
        }
      }
    }
  } catch { /* use fallback */ }

  const server = createServer((req, res) => {
    // Add CORS for iframe embedding from admin
    res.setHeader("Access-Control-Allow-Origin", "*");
    handler(req, res, () => {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(custom404);
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.on("error", reject);
      server.listen(port, () => resolve());
    });
  } catch (err: any) {
    // Port in use (e.g. stale sirv from previous PM2 restart) — try to reuse
    if (err?.code === "EADDRINUSE") {
      console.warn(`Preview port ${port} already in use — reusing existing server`);
      return NextResponse.json({ url: `http://localhost:${port}` });
    }
    throw err;
  }

  activeServers.set(siteId, { server, port });

  console.log(`Preview server for "${siteId}" started on http://localhost:${port} (serving ${distDir})`);

  return NextResponse.json({ url: `http://localhost:${port}` });
}
