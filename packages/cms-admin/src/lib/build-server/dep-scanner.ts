/**
 * F143 P4 — Auto-detect npm dependencies from a build.ts source file.
 *
 * Parses the file via es-module-lexer (AST-light, fast) and extracts
 * all `import x from 'pkg'`, `import('pkg')`, and `require('pkg')`
 * specifiers, then filters out:
 *
 *   - node:* builtins
 *   - relative paths (./foo, ../bar)
 *   - absolute paths
 *   - core deps cms-admin already provides (marked, sharp, ...)
 *
 * Returns the residual list of npm package names that the site needs
 * but cms-admin doesn't provide. Caller then passes this list to the
 * deps-store + installer.
 *
 * The scanner is best-effort by design — it catches static imports
 * (99% of build.ts cases per the 2026-05-02 audit). For dynamic
 * `import(stringFromVariable)` or string-eval'd specifiers, sites
 * declare manually via `cms.config.ts.build.deps`.
 */
import { existsSync, readFileSync } from "node:fs";
import { isProvidedBuildDep } from "./provided-deps";

export interface ScanResult {
  /** All raw bare-import specifiers found in the file. */
  rawImports: string[];
  /** Specifiers normalised to package names (drops submodule suffix). */
  packageNames: string[];
  /** Package names that are NOT provided by cms-admin (need install). */
  missing: string[];
  /**
   * Detected build framework hint from package.json or imports.
   * Used by P-future to pick a builder Dockerfile template (F144).
   */
  framework?: "static" | "nextjs" | "bun-hono" | "vite-spa";
}

/**
 * Scan a build.ts file's bare imports. Returns scan result with
 * package names + the residual deps that need install.
 *
 * Returns empty arrays + null framework if the file doesn't exist.
 */
export async function scanBuildFile(filePath: string): Promise<ScanResult> {
  if (!existsSync(filePath)) {
    return { rawImports: [], packageNames: [], missing: [] };
  }
  const source = readFileSync(filePath, "utf-8");
  return scanBuildSource(source);
}

/**
 * Scan a build.ts source string. Pure function; useful for tests +
 * for callers that already have the source in memory.
 */
export async function scanBuildSource(source: string): Promise<ScanResult> {
  const lex = await import("es-module-lexer");
  await lex.init;
  const [imports] = lex.parse(source);

  const rawImports: string[] = [];
  for (const imp of imports) {
    // imp.n is the resolved specifier string (handles dynamic imports
    // with string literals + static imports). Falsy when es-module-
    // lexer can't statically resolve (e.g. import(variable)).
    if (!imp.n) continue;
    rawImports.push(imp.n);
  }

  // Also scan for require('...') — es-module-lexer doesn't emit
  // CommonJS calls in its imports list. Static-only regex; misses
  // require(variable) which we accept (manual override path exists).
  const requireMatches = source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
  for (const m of requireMatches) {
    if (m[1]) rawImports.push(m[1]);
  }

  // Normalise: filter to bare specifiers, dedupe, drop builtins/relative
  const seen = new Set<string>();
  const packageNames: string[] = [];
  for (const spec of rawImports) {
    if (!isBareSpecifier(spec)) continue;
    const pkg = bareSpecifierToPackageName(spec);
    if (seen.has(pkg)) continue;
    seen.add(pkg);
    packageNames.push(pkg);
  }
  packageNames.sort();

  // Residual: drop deps cms-admin already provides
  const missing = packageNames.filter((p) => !isProvidedBuildDep(p));

  return { rawImports, packageNames, missing };
}

/**
 * True if the specifier is a bare npm import (not `./relative`, not
 * `/abs`, not `node:builtin`, not URL-scheme).
 */
function isBareSpecifier(spec: string): boolean {
  if (!spec) return false;
  if (spec.startsWith(".") || spec.startsWith("/")) return false;
  if (spec.includes(":")) return false; // node:fs, http:, file:, data:
  return true;
}

/**
 * Strip submodule suffix from a bare specifier:
 *   `marked/lib/marked.cjs` → `marked`
 *   `@webhouse/cms/types`   → `@webhouse/cms`
 *   `lodash`                → `lodash`
 */
export function bareSpecifierToPackageName(spec: string): string {
  if (spec.startsWith("@")) {
    // Scoped: keep `@scope/name` portion
    const parts = spec.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
  }
  // Non-scoped: keep up to first `/`
  const idx = spec.indexOf("/");
  return idx === -1 ? spec : spec.slice(0, idx);
}

/**
 * Detect site framework from a project directory. Used to pick the
 * right Builder image / handler in F144. Returns null if undetectable.
 */
export function detectFramework(projectDir: string): ScanResult["framework"] | undefined {
  if (!existsSync(projectDir)) return undefined;
  // Check for framework signals in known order. Most-specific first.
  if (existsSync(`${projectDir}/next.config.ts`) || existsSync(`${projectDir}/next.config.mjs`) || existsSync(`${projectDir}/next.config.js`)) {
    return "nextjs";
  }
  if (existsSync(`${projectDir}/bun.lockb`) || existsSync(`${projectDir}/bunfig.toml`)) {
    return "bun-hono";
  }
  if (existsSync(`${projectDir}/vite.config.ts`) || existsSync(`${projectDir}/vite.config.js`)) {
    return "vite-spa";
  }
  if (existsSync(`${projectDir}/build.ts`) || existsSync(`${projectDir}/build.mjs`) || existsSync(`${projectDir}/build.js`)) {
    return "static";
  }
  return undefined;
}
