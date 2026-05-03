/**
 * F143 Phase 1 — Single source of truth for npm packages cms-admin
 * provides to site builds without per-site `node_modules`.
 *
 * Audit of 20 build.ts files in /Users/cb/Apps/* (2026-05-02) showed:
 *   - 11/20 imported only Node stdlib (no npm deps)
 *   - 5/20 imported just `marked`
 *   - 0/20 had heavy/exotic deps
 *
 * The five packages below cover ~99% of static-site build needs.
 * Sites that need anything else declare them in `cms.config.ts.build.deps`
 * (Phase 3) — installed on-demand into a content-addressable store on the
 * Fly volume, not into per-site `node_modules`.
 *
 * IMPORTANT: this list MUST stay in sync with both:
 *   1. cms-admin's `package.json` `dependencies` field (the actual install)
 *   2. `scripts/build-runtime-loader.mjs` PROVIDED array (the ESM resolver)
 * The loader script is plain `.mjs` because it's a Node loader hook,
 * loaded outside the TypeScript build. We import the array via this
 * module from any TypeScript code that needs to know what's provided.
 */

/**
 * Packages cms-admin provides to site builds. Sites can import any of
 * these from a `build.ts` without declaring them in their own
 * `package.json` and without a per-site `node_modules`.
 *
 * Why each:
 *   - `@webhouse/cms`           — core CMS types / helpers (always)
 *   - `marked`                  — markdown → HTML (5/20 sites use)
 *   - `marked-highlight`        — syntax highlighting in code blocks
 *   - `gray-matter`             — frontmatter parser (used by sites that
 *                                 mix `.md` content with JSON)
 *   - `slugify`                 — text → URL-slug normalization
 *   - `sharp`                   — image resize/format conversion
 */
export const PROVIDED_BUILD_DEPS = [
  "@webhouse/cms",
  "marked",
  "marked-highlight",
  "gray-matter",
  "slugify",
  "sharp",
] as const;

export type ProvidedBuildDep = (typeof PROVIDED_BUILD_DEPS)[number];

/**
 * Returns true if a bare import specifier is satisfied by cms-admin's
 * own runtime — site doesn't need a per-site install for it.
 *
 * Matches exact name OR submodule (e.g. `marked/lib/marked.cjs` is
 * provided because root `marked` is). Relative/absolute paths and
 * `node:` builtins are never provided.
 */
export function isProvidedBuildDep(specifier: string): boolean {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.includes(":")
  ) {
    return false;
  }
  return PROVIDED_BUILD_DEPS.some(
    (p) => specifier === p || specifier.startsWith(`${p}/`),
  );
}
