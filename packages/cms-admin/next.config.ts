import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker — self-contained server without node_modules
  output: "standalone",

  // F178.4 — the E2E suite needs its own build directory, not a preference.
  //
  // `next dev` takes an exclusive lock on `.next/dev/lock`. The suite boots a
  // SECOND dev server (port 3011, see e2e/fixtures/base-url.ts) from this same
  // directory, so while Christian's cms-admin is running on 3010 the suite's
  // server cannot start at all: every test dies on ERR_CONNECTION_REFUSED.
  //
  // That is why nobody caught that the E2E job had never once been green —
  // running it locally to check was impossible, and killing the server on 3010
  // to make room is forbidden by a repo hard rule. Set NEXT_DIST_DIR and the
  // two instances stop contending. Unset, this is exactly the old behaviour.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  serverExternalPackages: ["better-sqlite3", "@webhouse/cms", "jiti"],

  // F143: tsx + provided build deps are spawned at runtime via execFileSync /
  // child_process.spawn — Next.js's static import tracing doesn't see them and
  // tree-shakes them out of the standalone build. Force-include via
  // outputFileTracingIncludes so they survive into the standalone node_modules.
  outputFileTracingIncludes: {
    // Wildcard key applies to ALL routes; tracing ships the listed paths in
    // the standalone bundle. Patterns are glob, evaluated relative to
    // outputFileTracingRoot (defaults to the project root, which is the
    // monorepo root here).
    //
    // F194.1 — HVER GLOB PEGER PÅ PAKKENS EGEN MAPPE, ikke på hele dens
    // .pnpm-bibliotek. Grunden er målt: `<pkg>@*/**` rammer også de SYMLINKS
    // pnpm lægger i søskende-mappen node_modules/, og fra next 16.3.3 forsøger
    // Turbopack at hashe sådan et link som en FIL:
    //
    //   Error [TurbopackInternalError]: reading file
    //     ".pnpm/gray-matter@4.0.3/node_modules/js-yaml"
    //   Caused by: Is a directory (os error 21)
    //
    // 16.1.6 tolererede det, 16.3.3 og 16.3.4 gør ikke. Fire af de syv globs
    // rammer symlinks (målt: tsx 3, marked-highlight 1, gray-matter 4,
    // sharp 2), så det var ikke en enkeltstående sti.
    //
    // Afhængighederne står derfor ved navn nedenfor. Det er mere at
    // vedligeholde, og det er prisen for at listen er EKSPLICIT: en manglende
    // pakke i standalone-bygget viser sig som et nedbrud ved kørsel, ikke som
    // en tavs mangel.
    "*": [
      // tsx spawnes ved kørsel (F143) — den ses ikke af statisk sporing.
      "../../node_modules/.pnpm/tsx@*/node_modules/tsx/**",
      "../../node_modules/.pnpm/esbuild@*/node_modules/esbuild/**",
      "../../node_modules/.pnpm/get-tsconfig@*/node_modules/get-tsconfig/**",
      "../../node_modules/.pnpm/resolve-pkg-maps@*/node_modules/resolve-pkg-maps/**",
      "../../node_modules/.pnpm/es-module-lexer@*/node_modules/es-module-lexer/**",
      // markdown-kæden
      "../../node_modules/.pnpm/marked@*/node_modules/marked/**",
      "../../node_modules/.pnpm/marked-highlight@*/node_modules/marked-highlight/**",
      // gray-matter + dens fire afhængigheder
      "../../node_modules/.pnpm/gray-matter@*/node_modules/gray-matter/**",
      "../../node_modules/.pnpm/js-yaml@*/node_modules/js-yaml/**",
      "../../node_modules/.pnpm/argparse@*/node_modules/argparse/**",
      "../../node_modules/.pnpm/esprima@*/node_modules/esprima/**",
      "../../node_modules/.pnpm/kind-of@*/node_modules/kind-of/**",
      "../../node_modules/.pnpm/strip-bom-string@*/node_modules/strip-bom-string/**",
      "../../node_modules/.pnpm/section-matter@*/node_modules/section-matter/**",
      "../../node_modules/.pnpm/extend-shallow@*/node_modules/extend-shallow/**",
      "../../node_modules/.pnpm/is-extendable@*/node_modules/is-extendable/**",
      "../../node_modules/.pnpm/slugify@*/node_modules/slugify/**",
      // sharp + dens to
      "../../node_modules/.pnpm/sharp@*/node_modules/sharp/**",
      "../../node_modules/.pnpm/detect-libc@*/node_modules/detect-libc/**",
      "../../node_modules/.pnpm/semver@*/node_modules/semver/**",
    ],
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
