import { NextRequest, NextResponse } from "next/server";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "path";
import { getMobileSession } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/preview-proxy?dir=/path/to/dist&path=/index.html
 *
 * On-demand sirv preview proxy for sites without a configured previewUrl.
 * Starts a sirv server for the given dist/ directory (reuses existing ones),
 * then proxies the request to it.
 *
 * Auth: Bearer JWT.
 */

// Track running sirv servers: distDir → { server, port }
const sirvServers = new Map<string, { server: Server; port: number }>();

async function findFreePort(): Promise<number> {
  try {
    const res = await fetch("https://cl.broberg.dk/api/vacant-port");
    if (res.ok) {
      const data = (await res.json()) as { port: number };
      return data.port;
    }
  } catch {
    /* fall through */
  }
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

async function ensureSirv(distDir: string): Promise<number> {
  const existing = sirvServers.get(distDir);
  if (existing) {
    try {
      const check = await fetch(`http://localhost:${existing.port}/`, {
        signal: AbortSignal.timeout(500),
      });
      if (check.ok || check.status === 404) {
        return existing.port;
      }
    } catch {
      /* dead */
    }
    sirvServers.delete(distDir);
  }

  const sirv = (await import("sirv")).default;
  const port = await findFreePort();

  const handler = sirv(distDir, {
    single: false,
    etag: true,
    gzip: true,
    dev: true,
  });

  // Try loading custom 404
  let custom404 = "<h1>404</h1>";
  const site404 = path.join(distDir, "404.html");
  if (existsSync(site404)) {
    custom404 = readFileSync(site404, "utf-8");
  }

  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    handler(req, res, () => {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(custom404);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => resolve());
  });

  sirvServers.set(distDir, { server, port });
  console.log(`[preview-proxy] sirv started on :${port} for ${distDir}`);
  return port;
}

export async function GET(req: NextRequest) {
  // Auth check
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const distDir = req.nextUrl.searchParams.get("dir");
  const filePath = req.nextUrl.searchParams.get("path") ?? "/";

  if (!distDir || !existsSync(distDir)) {
    return NextResponse.json({ error: "dist/ not found" }, { status: 404 });
  }

  try {
    const port = await ensureSirv(distDir);
    // Proxy the request to sirv
    const sirvUrl = `http://localhost:${port}${filePath}`;
    const upstream = await fetch(sirvUrl, { signal: AbortSignal.timeout(5000) });

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "text/html");
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Preview proxy failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
