import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
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

export async function POST(_req: NextRequest) {
  const sitePaths = await getActiveSitePaths();
  const distDir = path.join(sitePaths.projectDir, "dist");

  if (!existsSync(distDir)) {
    return NextResponse.json(
      { error: `No dist/ directory found at ${distDir}. Run the site's build first.` },
      { status: 404 },
    );
  }

  const siteId = distDir;

  // Reuse existing server if still running
  const existing = activeServers.get(siteId);
  if (existing) {
    try {
      // Quick check that it's still alive
      const check = await fetch(`http://localhost:${existing.port}/`, { signal: AbortSignal.timeout(500) });
      if (check.ok) {
        return NextResponse.json({ url: `http://localhost:${existing.port}` });
      }
    } catch { /* server died, start new one */ }
    activeServers.delete(siteId);
  }

  const port = await findFreePort();

  const handler = sirv(distDir, {
    single: false,
    etag: true,
    gzip: true,
    dev: true,    // no caching in dev
  });

  const server = createServer((req, res) => {
    // Add CORS for iframe embedding from admin
    res.setHeader("Access-Control-Allow-Origin", "*");
    handler(req, res, () => {
      // 404 fallback
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<h1>404 — Not Found</h1><p>This page doesn't exist in dist/.</p>");
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => resolve());
  });

  activeServers.set(siteId, { server, port });

  console.log(`Preview server for "${siteId}" started on http://localhost:${port} (serving ${distDir})`);

  return NextResponse.json({ url: `http://localhost:${port}` });
}
