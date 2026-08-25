import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The guard for lib/redirect.ts.
 *
 * `new URL(path, req.url)` inside the Next standalone server resolves against
 * the address the process BINDS to, and the container exports
 * `HOSTNAME=0.0.0.0`. Eleven redirects were built that way and every one of
 * them sent the browser an absolute `Location: https://0.0.0.0:3010/…`:
 *
 *   GET https://webhouse.app/admin/goto/<id>
 *   → 307  location: https://0.0.0.0:3010/admin/forms/contact
 *
 * That is the "Åbn i CMS" button in every notification mail, the whole GitHub
 * sign-in callback, and the site-switch link. Nothing failed loudly; the
 * browser simply landed on a certificate warning for an address that does not
 * exist.
 *
 * Use `redirectTo(path)` instead — a relative Location the browser resolves
 * against the address it actually used.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(abs);
  }
  return out;
}

describe("redirects", () => {
  it("no route builds a redirect from req.url", () => {
    const appDir = path.resolve(__dirname, "../../app");
    const offenders = walk(appDir)
      .filter((abs) => {
        // Comments are stripped first — this rule is explained in prose in
        // more than one file, and a scanner that trips over its own
        // documentation is a scanner people disable.
        const src = readFileSync(abs, "utf-8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^[ \t]*\/\/.*$/gm, "");
        return /new URL\([^)]*,\s*(?:req|request)\.url\s*\)/.test(src);
      })
      .map((abs) => path.relative(path.resolve(appDir, "../.."), abs));

    expect(
      offenders,
      `use redirectTo() from @/lib/redirect instead of new URL(path, req.url) in: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
