/**
 * F143 P5 — PIN-FIRST version resolution.
 *
 * When auto-detect adds a dep WITHOUT a version specifier, we resolve
 * the latest version via `pnpm view <pkg> version` ONCE at install
 * time and pin that exact version in the deps-store. The deps-store
 * hash includes the pinned version, so two days from now the same
 * site still installs the SAME version even if npm has a newer one.
 *
 * Manual `cms.config.ts.build.deps` entries that already include a
 * specifier (e.g. `'three@^0.158.0'`) are passed through unchanged —
 * pnpm respects the range and the lockfile pins the resolved version.
 *
 * The principle: WE NEVER AUTO-UPGRADE. Auto-detect adds new deps;
 * upgrades require an explicit user action (Phase 5 UI, future work).
 */
import { spawn } from "node:child_process";

/**
 * Resolve `latest` for unspecified deps. Spec list in → spec list out
 * with each unversioned entry replaced by `name@<exact-version>`.
 *
 * Specifier already has a version (contains `@` after position 0)?
 * Pass through unchanged — pnpm + lockfile will pin within the range.
 *
 * Network failure for a single lookup? Leave as `latest` — install
 * will still succeed (just won't be reproducible across days). This
 * is a tradeoff: better to ship a deploy than block on a flaky npm.
 */
export async function pinVersions(
  deps: readonly string[],
  opts: { pnpmBin?: string; timeoutMs?: number } = {},
): Promise<string[]> {
  const out: string[] = [];
  for (const spec of deps) {
    const trimmed = spec.trim();
    if (!trimmed) continue;
    const atIdx = trimmed.indexOf("@", 1);
    // Already has a version specifier — pass through
    if (atIdx > 0) {
      out.push(trimmed);
      continue;
    }
    // Unversioned — resolve latest
    const name = trimmed;
    const version = await resolveLatestVersion(name, opts).catch(() => null);
    if (version) {
      out.push(`${name}@${version}`);
    } else {
      // Lookup failed — keep unversioned, pnpm will install latest
      // and lockfile will pin the resolved version. Less ideal but
      // not a blocker.
      out.push(name);
    }
  }
  return out;
}

/**
 * Resolve a single package's latest version via `pnpm view`.
 * Returns null on any failure (network, missing package, parse error).
 */
export function resolveLatestVersion(
  name: string,
  opts: { pnpmBin?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  const pnpmBin = opts.pnpmBin ?? "pnpm";
  const timeoutMs = opts.timeoutMs ?? 10_000;
  return new Promise<string | null>((resolve) => {
    let stdout = "";
    const child = spawn(pnpmBin, ["view", name, "version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let killed = false;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    // Give up on the TIMER, not on the child's cooperation. SIGTERM to a shell
    // does not necessarily reach its grandchildren, and "close" only fires once
    // every stdio pipe is closed — a surviving grandchild holds stdout open, so
    // the promise never settles and the caller hangs forever despite having
    // asked for a timeout. Seen on Linux (CI), not on macOS, where sh execs the
    // single command and the kill lands on the real process.
    const timer = setTimeout(() => {
      killed = true;
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      finish(null);
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.on("close", (code) => {
      if (killed || code !== 0) {
        finish(null);
        return;
      }
      const v = stdout.trim();
      // Sanity-check: looks like a semver (digit at start, contains a dot)
      finish(/^\d+\.\d+/.test(v) ? v : null);
    });
    child.on("error", () => {
      finish(null);
    });
  });
}
