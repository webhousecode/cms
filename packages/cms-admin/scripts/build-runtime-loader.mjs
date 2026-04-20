/**
 * ESM loader that lets a site's build.ts import shared deps (@webhouse/cms,
 * marked, etc.) from cms-admin's node_modules — so the site does NOT need
 * its own node_modules, package.json, or pinned version.
 *
 * Activated via NODE_OPTIONS="--loader <thisfile>" when deploy-service runs
 * a site's build.ts. CMS_ADMIN_ROOT env var points at cms-admin's package dir.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

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
const PROVIDED = ["@webhouse/cms", "marked"];

function isProvided(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.includes(":")) return false;
  return PROVIDED.some((p) => specifier === p || specifier.startsWith(p + "/"));
}

export async function resolve(specifier, context, nextResolve) {
  if (isProvided(specifier)) {
    return nextResolve(specifier, { ...context, parentURL: adminPkgUrl });
  }
  return nextResolve(specifier, context);
}
