import { NextRequest, NextResponse } from "next/server";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "path";
import { getMobileSession } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/preview-proxy?upstream=http://localhost:3034&path=/
 * GET /api/mobile/preview-proxy?dir=/path/to/dist&path=/
 *
 * Unified preview proxy for mobile. Two modes:
 *
 * 1. `upstream` — proxy to an already-running localhost server (e.g. .NET, Ruby, Rust).
 *    Most dev servers only bind to localhost, so the phone can't reach them
 *    directly via LAN IP. This endpoint relays the request.
 *
 * 2. `dir` — start sirv on-demand for a dist/ directory (sites without previewUrl).
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
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const upstream = req.nextUrl.searchParams.get("upstream");
  const distDir = req.nextUrl.searchParams.get("dir");
  const filePath = req.nextUrl.searchParams.get("path") ?? "/";

  // Mode 1: Proxy to an already-running localhost server
  if (upstream) {
    try {
      const upstreamUrl = new URL(filePath, upstream).toString();
      const res = await fetch(upstreamUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "Accept": req.headers.get("Accept") ?? "*/*",
          "Accept-Encoding": "identity",
        },
      });

      const headers = new Headers();
      // Pass through content type and other relevant headers
      for (const key of ["content-type", "cache-control", "etag", "last-modified"]) {
        const val = res.headers.get(key);
        if (val) headers.set(key, val);
      }
      headers.set("Access-Control-Allow-Origin", "*");
      // Allow iframe embedding
      headers.delete("X-Frame-Options");

      return new NextResponse(res.body, {
        status: res.status,
        headers,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Upstream proxy failed: ${(err as Error).message}` },
        { status: 502 },
      );
    }
  }

  // Mode 2: Sirv on-demand for dist/ directory
  if (distDir) {
    if (!existsSync(distDir)) {
      return NextResponse.json({ error: "dist/ not found" }, { status: 404 });
    }
    try {
      const port = await ensureSirv(distDir);
      const sirvUrl = `http://localhost:${port}${filePath}`;
      const res = await fetch(sirvUrl, { signal: AbortSignal.timeout(5000) });

      const headers = new Headers();
      headers.set("Content-Type", res.headers.get("Content-Type") ?? "text/html");
      headers.set("Access-Control-Allow-Origin", "*");

      return new NextResponse(res.body, { status: res.status, headers });
    } catch (err) {
      return NextResponse.json(
        { error: `Sirv proxy failed: ${(err as Error).message}` },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ error: "Missing upstream or dir parameter" }, { status: 400 });
}
