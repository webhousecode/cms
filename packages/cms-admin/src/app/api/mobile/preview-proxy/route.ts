import { NextRequest, NextResponse } from "next/server";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "path";
import { getMobileSession } from "@/lib/mobile-auth";
import { verifyPreviewToken } from "@/lib/preview-token";

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

/**
 * Inject scripts into proxied HTML:
 * 1. URL tracker — reports current path to parent via postMessage
 * 2. Link interceptor — rewrites internal link clicks to go through the proxy
 *    so in-iframe navigation works (without this, links resolve against cms-admin's origin)
 */
function injectUrlTracker(html: string, proxyBase: string): string {
  const script = `<script>(function(){
    // URL tracker
    function r(){window.parent.postMessage({type:'wh-preview-url',url:location.pathname+location.search},'*')}
    r();
    var p=history.pushState;history.pushState=function(){p.apply(this,arguments);r()};
    var q=history.replaceState;history.replaceState=function(){q.apply(this,arguments);r()};
    window.addEventListener('popstate',r);

    // Link interceptor — rewrite ALL internal navigation through proxy
    var base='${proxyBase}';
    var origin=location.origin;
    var upstreamOrigin='${upstream ? new URL(upstream.endsWith("/") ? upstream : upstream + "/").origin : ""}';
    var upstreamPath='${upstream ? new URL(upstream.endsWith("/") ? upstream : upstream + "/").pathname.replace(/\/$/, "") : ""}';
    if(base){
      document.addEventListener('click',function(e){
        var a=e.target.closest('a');
        if(!a)return;
        var href=a.getAttribute('href');
        if(!href||href.startsWith('#')||href.startsWith('mailto:')||href.startsWith('javascript:'))return;
        var newPath;
        if(href.startsWith('http')){
          // Absolute URL — check if it's same upstream domain
          try{
            var u=new URL(href);
            if(u.origin===upstreamOrigin){
              // Strip upstream base path to get relative path
              newPath=u.pathname;
              if(upstreamPath&&newPath.startsWith(upstreamPath)){
                newPath=newPath.slice(upstreamPath.length)||'/';
              }
            }else{return}// External link — don't intercept
          }catch(ex){return}
        }else if(href.startsWith('//')){
          return;// Protocol-relative external
        }else{
          newPath=href.startsWith('/')?href:'/'+href;
        }
        e.preventDefault();
        window.location.href=base+'&path='+encodeURIComponent(newPath);
      },true);
    }
  })()</script>`;
  if (html.includes("</head>")) return html.replace("</head>", script + "</head>");
  if (html.includes("</body>")) return html.replace("</body>", script + "</body>");
  return html + script;
}

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
  const upstream = req.nextUrl.searchParams.get("upstream");
  const distDir = req.nextUrl.searchParams.get("dir");
  const filePath = req.nextUrl.searchParams.get("path") ?? "/";
  const token = req.nextUrl.searchParams.get("tok");

  // Auth: accept signed URL token (for iframes) OR Bearer JWT (for API calls)
  const payload = upstream ?? distDir ?? "";
  const tokenValid = verifyPreviewToken(token, payload);

  if (!tokenValid) {
    const session = await getMobileSession(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
  }

  // Build proxy base URL for link rewriting — use relative path so it works
  // regardless of whether iframe was loaded from localhost or LAN IP
  const proxyBaseParams = new URLSearchParams();
  if (upstream) proxyBaseParams.set("upstream", upstream);
  if (distDir) proxyBaseParams.set("dir", distDir);
  if (token) proxyBaseParams.set("tok", token);
  const proxyBase = `/api/mobile/preview-proxy?${proxyBaseParams.toString()}`;

  // Mode 1: Proxy to an already-running localhost server
  if (upstream) {
    try {
      // Ensure upstream base has trailing slash so URL resolution preserves the path
      const base = upstream.endsWith("/") ? upstream : upstream + "/";
      const upstreamUrl = filePath === "/" ? base : new URL(filePath.replace(/^\//, ""), base).toString();
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
      headers.delete("X-Frame-Options");

      // Inject URL tracking script into HTML responses
      const ct = headers.get("content-type") ?? "";
      if (ct.includes("text/html")) {
        let html = await res.text();
        html = injectUrlTracker(html, proxyBase);
        return new NextResponse(html, { status: res.status, headers });
      }

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
      const sirvCt = res.headers.get("Content-Type") ?? "text/html";
      headers.set("Content-Type", sirvCt);
      headers.set("Access-Control-Allow-Origin", "*");

      if (sirvCt.includes("text/html")) {
        let html = await res.text();
        html = injectUrlTracker(html, proxyBase);
        return new NextResponse(html, { status: res.status, headers });
      }

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
