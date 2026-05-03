/**
 * ESM loader that lets a site's build.ts import shared deps (@webhouse/cms,
 * marked, etc.) from cms-admin's node_modules — so the site does NOT need
 * its own node_modules, package.json, or pinned version.
 *
 * Activated via NODE_OPTIONS="--loader <thisfile>" when deploy-service runs
 * a site's build.ts. CMS_ADMIN_ROOT env var points at cms-admin's package dir.
 *
 * Two resolution paths:
 *   1. Re-parent the import to cms-admin's package.json so Node's ESM
 *      resolver walks the per-package node_modules (works in dev and any
 *      environment where pnpm's per-package symlinks survived).
 *   2. Fall back to direct .pnpm-store path lookup. Required for Next.js
 *      standalone deployments — Next's tracer ships the .pnpm content
 *      store but DROPS the per-package symlinks (node_modules/marked,
 *      etc.) that pnpm normally creates, which breaks the standard
 *      resolver. We scan .pnpm/[name]@[ver]/node_modules/[name]/ to find
 *      package.json manually and return the file URL of the main entry.
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const ADMIN_ROOT = process.env.CMS_ADMIN_ROOT;
if (!ADMIN_ROOT) {
  throw new Error("build-runtime-loader: CMS_ADMIN_ROOT must be set");
}

// Pretend the import came from cms-admin's package.json, so Node's ESM
// resolver walks cms-admin's node_modules tree (including monorepo hoisting)
// and honors the "import" export condition (giving ESM over CJS).
const adminPkgUrl = pathToFileURL(path.join(ADMIN_ROOT, "package.json")).href;

// Packages cms-admin provides to site builds. Any bare specifier matching
// one of these (exactly, or as `<name>/subpath`) resolves via admin's tree.
//
// MUST stay in sync with src/lib/build-server/provided-deps.ts —
// the TS module is the canonical source for code that needs the list at
// type-check time; this file mirrors it because Node loaders cannot import
// from .ts modules. A test verifies parity (provided-deps.test.ts).
const PROVIDED = [
  "@webhouse/cms",
  "marked",
  "marked-highlight",
  "gray-matter",
  "slugify",
  "sharp",
];

function isProvided(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.includes(":")) return false;
  return PROVIDED.some((p) => specifier === p || specifier.startsWith(p + "/"));
}

// Cache the .pnpm store directory + per-package locations so we only scan
// once per process. The structure is stable for the lifetime of the build.
let pnpmStoreCache = null;

/**
 * Locate a provided package in cms-admin's .pnpm store. Returns the
 * absolute path to the package directory (containing package.json), or
 * null if not found.
 *
 * Scans up to 3 candidate roots in order: standalone hoisted, monorepo
 * root, cms-admin local. First match wins.
 */
function findInPnpmStore(packageName) {
  if (!pnpmStoreCache) {
    const candidates = [
      // Next.js standalone hoisting
      path.join(ADMIN_ROOT, "..", "..", "node_modules", ".pnpm"),
      // Monorepo root (dev)
      path.resolve(ADMIN_ROOT, "..", "..", "node_modules", ".pnpm"),
      // cms-admin local
      path.join(ADMIN_ROOT, "node_modules", ".pnpm"),
    ];
    pnpmStoreCache = candidates.filter((p) => existsSync(p));
  }

  // pnpm dir name format: `<name>@<version>` for plain packages,
  // `<scope>+<name>@<version>` for scoped packages. Then peer-deps add
  // `_<peer>@<version>` suffixes.
  const dirNamePrefix = packageName.startsWith("@")
    ? `${packageName.replace("/", "+")}@`
    : `${packageName}@`;

  for (const storeDir of pnpmStoreCache) {
    let entries;
    try { entries = readdirSync(storeDir); } catch { continue; }
    // Find candidates matching the prefix; prefer the one without peer-
    // dep suffix (cleanest version).
    const matches = entries.filter((e) => e.startsWith(dirNamePrefix));
    if (matches.length === 0) continue;
    // Prefer entries without `_` (no peer-dep suffix) — typically the
    // "primary" install
    matches.sort((a, b) => {
      const aPeer = a.indexOf("_") > -1 ? 1 : 0;
      const bPeer = b.indexOf("_") > -1 ? 1 : 0;
      return aPeer - bPeer;
    });
    const pkgDir = path.join(storeDir, matches[0], "node_modules", packageName);
    if (existsSync(path.join(pkgDir, "package.json"))) {
      return pkgDir;
    }
  }
  return null;
}

/**
 * Compute the entry-point URL for a package given its directory + the
 * full original specifier (which may include a sub-path like `marked/lib/X`).
 */
function resolveEntryUrl(pkgDir, packageName, fullSpecifier) {
  // Sub-path import? Just append it (Node will handle the file extension).
  const subPath = fullSpecifier.slice(packageName.length); // "" or "/foo/bar"
  if (subPath) {
    const target = path.join(pkgDir, subPath);
    return pathToFileURL(target).href;
  }
  // Bare package name — read package.json's main/module/exports.
  try {
    const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf-8"));
    // Honor "exports.." if present (modern packages)
    if (pkg.exports) {
      // Try import condition first, then default
      const exp = pkg.exports;
      if (typeof exp === "string") {
        return pathToFileURL(path.join(pkgDir, exp)).href;
      }
      const defaultExp = exp["."] ?? exp;
      if (defaultExp && typeof defaultExp === "object") {
        const target = defaultExp.import ?? defaultExp.default ?? defaultExp.require;
        if (typeof target === "string") {
          return pathToFileURL(path.join(pkgDir, target)).href;
        }
        if (target && typeof target === "object") {
          const nested = target.default ?? target.import;
          if (typeof nested === "string") {
            return pathToFileURL(path.join(pkgDir, nested)).href;
          }
        }
      }
    }
    const main = pkg.module ?? pkg.main ?? "index.js";
    return pathToFileURL(path.join(pkgDir, main)).href;
  } catch {
    return pathToFileURL(path.join(pkgDir, "index.js")).href;
  }
}

function packageNameFromSpecifier(spec) {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
  }
  const idx = spec.indexOf("/");
  return idx === -1 ? spec : spec.slice(0, idx);
}

// F143 P5 + P6 fix: per-site extra-deps store (zod, lodash, etc. — anything
// the build.ts imports that cms-admin doesn't ship). NODE_PATH would work
// for CommonJS but ESM `import` ignores it, so the loader has to handle it.
// CMS_BUILD_EXTRA_DEPS_DIR is set by run-site-build.ts and points at a
// flat node_modules dir produced by the deps-store installer.
const EXTRA_DEPS_DIR = process.env.CMS_BUILD_EXTRA_DEPS_DIR || null;

function resolveFromExtraDeps(specifier) {
  if (!EXTRA_DEPS_DIR) return null;
  const pkgName = packageNameFromSpecifier(specifier);
  // Hoisted layout (--config.nodeLinker=hoisted): flat dir per pkg
  let pkgDir = path.join(EXTRA_DEPS_DIR, pkgName);
  if (existsSync(path.join(pkgDir, "package.json"))) {
    return resolveEntryUrl(pkgDir, pkgName, specifier);
  }
  // Default pnpm symlinked layout: <name> resolves via .pnpm/<name>@<ver>
  const pnpmStore = path.join(EXTRA_DEPS_DIR, ".pnpm");
  if (existsSync(pnpmStore)) {
    const dirNamePrefix = pkgName.startsWith("@")
      ? `${pkgName.replace("/", "+")}@`
      : `${pkgName}@`;
    let entries;
    try { entries = readdirSync(pnpmStore); } catch { return null; }
    const matches = entries.filter((e) => e.startsWith(dirNamePrefix));
    matches.sort((a, b) => (a.indexOf("_") > -1 ? 1 : 0) - (b.indexOf("_") > -1 ? 1 : 0));
    if (matches.length > 0) {
      pkgDir = path.join(pnpmStore, matches[0], "node_modules", pkgName);
      if (existsSync(path.join(pkgDir, "package.json"))) {
        return resolveEntryUrl(pkgDir, pkgName, specifier);
      }
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (!isProvided(specifier)) {
    // Try the per-site extra-deps store before falling through. This
    // catches site-declared `import { z } from "zod"` style cases.
    const extraUrl = resolveFromExtraDeps(specifier);
    if (extraUrl) return { url: extraUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  }

  // Path 1: re-parent and let Node walk per-package symlinks (works in
  // dev + any environment where pnpm's symlinks survived). Stays in the
  // ORIGINAL non-await shape (no try/catch around await) to avoid
  // breaking local dev — return the Promise directly so Node handles
  // resolution errors normally up the chain.
  //
  // The fallback below is only used when the LOADER ITSELF (not the
  // caller's import) needs to handle a known-broken environment. We
  // detect that via the standalone-only env flag CMS_BUILD_USE_PNPM_FALLBACK
  // (set by run-site-build.ts in production).
  if (process.env.CMS_BUILD_USE_PNPM_FALLBACK !== "1") {
    return nextResolve(specifier, { ...context, parentURL: adminPkgUrl });
  }

  // Path 2: direct .pnpm-store scan. Next.js standalone tracer ships
  // .pnpm contents but DROPS the per-package symlinks pnpm normally
  // creates. We resolve by reading the package's package.json + main/
  // module/exports field manually.
  const pkgName = packageNameFromSpecifier(specifier);
  const pkgDir = findInPnpmStore(pkgName);
  if (!pkgDir) {
    // Couldn't find — let standard resolver throw with proper error
    return nextResolve(specifier, { ...context, parentURL: adminPkgUrl });
  }
  const url = resolveEntryUrl(pkgDir, pkgName, specifier);
  // shortCircuit: true tells Node to stop calling further hooks and use
  // our resolution. format omitted — Node infers from file extension /
  // package.json type, which is more reliable than us guessing "module".
  return { url, shortCircuit: true };
}
