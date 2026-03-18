# F78 — Bundled Preview Server

> Ship a 148 KB static file server with `@webhouse/cms` so `cms serve` works out of the box after build — no Python, no extra installs.

## Problem

After `cms build` outputs to `dist/`, there's no built-in way to preview the site. Users resort to:

```bash
python3 -m http.server 8080 -d dist   # not everyone has Python
npx serve dist                          # 6.9 MB download, not bundled
```

A CMS that builds static sites should be able to serve them. The server should come down with `npm create @webhouse/cms` — zero extra steps.

## Solution

Bundle `sirv` (148 KB, used by Vite internally) as a dependency of `@webhouse/cms`. Add a `cms serve` CLI command that starts a static file server with clean URLs, SPA fallback, gzip, and ETags. Also add `cms dev` enhancement: after the CMS dev server starts, optionally serve the built site in parallel.

## Research: Why sirv

| Option | Install size | Downloads/wk | Maintained | Clean URLs | SPA | Programmatic |
|--------|-------------|-------------|------------|-----------|-----|-------------|
| **sirv** | **148 KB** | 19.4M | Yes | Yes | Yes | Yes |
| serve (Vercel) | 6.9 MB | 19.5M | Yes | Yes | Yes | No (CLI only) |
| http-server | 4.7 MB | 4.5M | No (2022) | No | No | Partial |
| polka + sirv | 264 KB | 629K | Yes | Yes | Yes | Yes |
| DIY (http+fs) | 0 KB | — | — | Manual | Manual | Yes |

**sirv is what Vite uses internally** for `vite preview`. Battle-tested by millions of projects. 3 dependencies, all from the same author (Luke Edwards). MIT license.

## Technical Design

### 1. Add sirv Dependency

```bash
# In packages/cms — the core engine
pnpm add sirv
```

This adds 148 KB to node_modules. Since `@webhouse/cms` is already a dependency of every CMS project, sirv comes down automatically on `npm install` or `npm create @webhouse/cms`.

### 2. CLI Command: `cms serve`

```typescript
// packages/cms-cli/src/commands/serve.ts

import { createServer } from "node:http";
import sirv from "sirv";

interface ServeOptions {
  dir?: string;      // default: "dist"
  port?: number;     // default: 3000 (or from Code Launcher API)
  host?: string;     // default: "localhost"
  single?: boolean;  // SPA fallback, default: false
  open?: boolean;    // open browser, default: false
}

export async function serve(options: ServeOptions = {}) {
  const dir = options.dir ?? "dist";
  const port = options.port ?? 3000;
  const host = options.host ?? "localhost";

  const assets = sirv(dir, {
    single: options.single ?? false,
    dev: false,
    etag: true,
    gzip: true,
    brotli: true,
    // Clean URLs: /about → about.html or about/index.html
    extensions: ["html"],
  });

  const server = createServer(assets);

  server.listen(port, host, () => {
    console.log(`\n  Serving ${dir}/ on http://${host}:${port}\n`);
    if (options.open) {
      import("open").then((m) => m.default(`http://${host}:${port}`)).catch(() => {});
    }
  });

  return server;
}
```

### 3. CLI Integration

```bash
# Basic usage
cms serve                    # Serve dist/ on port 3000
cms serve dist -p 4000       # Custom dir and port
cms serve --single           # SPA mode (all routes → index.html)
cms serve --open             # Open browser after start

# Build + serve in one command
cms build && cms serve
```

Register in the CLI commander setup:

```typescript
// packages/cms-cli/src/index.ts

program
  .command("serve [dir]")
  .description("Serve built site with clean URLs and gzip")
  .option("-p, --port <port>", "Port number", "3000")
  .option("-H, --host <host>", "Host", "localhost")
  .option("--single", "SPA fallback (all routes → index.html)")
  .option("--open", "Open browser")
  .action(async (dir, opts) => {
    const { serve } = await import("./commands/serve.js");
    await serve({
      dir: dir ?? "dist",
      port: parseInt(opts.port),
      host: opts.host,
      single: opts.single,
      open: opts.open,
    });
  });
```

### 4. Code Launcher Integration

When running in the WebHouse ecosystem, use Code Launcher API for port assignment:

```typescript
// Before starting, check for vacant port
async function getPort(preferred: number): Promise<number> {
  try {
    const res = await fetch("https://cl.broberg.dk/api/vacant-port");
    const { port } = await res.json();
    return port;
  } catch {
    return preferred; // Fallback to preferred port
  }
}
```

### 5. Post-Build Message

After `cms build` completes, print a helpful message:

```
✓ Built 34 pages to dist/

  Preview your site:
    cms serve

  Or with a specific port:
    cms serve -p 4000
```

### 6. sirv Features We Get for Free

| Feature | How |
|---------|-----|
| Clean URLs | `/about` → `about.html` or `about/index.html` |
| Gzip/Brotli | Serves pre-compressed `.gz`/`.br` files if they exist |
| ETags | Automatic, avoids re-downloading unchanged files |
| MIME types | Via `mrmime` (covers all common file types) |
| Directory traversal protection | Path normalization built-in |
| Conditional requests (304) | If-None-Match / If-Modified-Since |
| SPA fallback | `single: true` — all 404s serve index.html |

### 7. Scaffold Integration

When `npm create @webhouse/cms` generates a new project, the `package.json` scripts include:

```json
{
  "scripts": {
    "dev": "cms dev",
    "build": "cms build",
    "preview": "cms serve",
    "start": "cms serve -p ${PORT:-3000}"
  }
}
```

## Implementation Steps

1. Add `sirv` as dependency to `packages/cms` (`pnpm add sirv`)
2. Create `packages/cms-cli/src/commands/serve.ts` with sirv wrapper
3. Register `cms serve` command in CLI commander setup
4. Add post-build message suggesting `cms serve`
5. Update `packages/create-cms/` scaffolder to include `preview` and `start` scripts
6. Add Code Launcher port integration (optional, graceful fallback)
7. Test: `cms build && cms serve` with clean URLs, gzip, 404 handling
8. Test SPA mode: `cms serve --single` for client-side routing sites

## Dependencies

- `sirv` npm package (148 KB, MIT, 19.4M downloads/week)
- No other dependencies

## Effort Estimate

**Small** — 1 day

- Morning: Add sirv, create serve command, register in CLI
- Afternoon: Post-build message, scaffolder update, testing
