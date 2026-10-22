import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * F210.2 — the brand colour lives in ONE place: `--brand` in app/globals.css.
 *
 * White-label (F210) swaps that one variable per customer. Every hardcoded
 * gold left in a component is a spot that keeps showing webhouse gold on
 * cms.fysio.work — and nothing else would notice, because on webhouse.app the
 * hardcoded value and the variable look identical.
 *
 * Scans the files on disk, never a hand-list: a file added tomorrow is covered.
 */

const SRC = join(process.cwd(), "src");
const GOLD = [
  /#f7bb2e/i,
  /rgba\(\s*247\s*,\s*187\s*,\s*46/i,
  // The sign-in screens' amber (#F59E0B) and its family, written as hsl.
  /hsl\(3[5-9] \d+% \d+%/,
];

/** Files that render standalone HTML outside the admin document, where the
 *  admin's CSS variables do not exist. Each moves to the brand pack in F210.4. */
const ALLOWED_FILES: Record<string, string> = {
  "app/api/admin/email-test/route.ts": "mail HTML — F210.4",
  "app/admin/inline-edit/connect/route.ts": "standalone HTML page — F210.4",
  "app/api/mobile/open/route.ts": "standalone HTML page — F210.4",
  "app/api/forms/[name]/widget.js/route.ts": "widget rendered on the customer's own site — F210.4",
};

/** A line may name the gold as text (an input placeholder) or as the fallback
 *  of the variable, for HTML injected into an iframe where --brand is absent. */
const ALLOWED_LINE = [/placeholder="#F7BB2E"/i, /var\(--brand(-foreground)?, #[0-9a-f]{6}\)/i];

function sourceFiles(): string[] {
  const out = execFileSync("find", [join(SRC, "components"), join(SRC, "app"), "-type", "f", "(", "-name", "*.tsx", "-o", "-name", "*.ts", ")"], {
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean).filter((f) => !f.includes("__tests__"));
}

describe("F210.2 — brand colour is a token, not a literal", () => {
  const files = sourceFiles();

  it("enumerates the real tree (a broken find must not pass as clean)", () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it("no component hardcodes webhouse gold", () => {
    const offenders: string[] = [];
    for (const abs of files) {
      const rel = relative(SRC, abs);
      if (ALLOWED_FILES[rel]) continue;
      readFileSync(abs, "utf8").split("\n").forEach((line, i) => {
        if (!GOLD.some((re) => re.test(line))) return;
        if (ALLOWED_LINE.some((re) => re.test(line))) return;
        offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(offenders, `use var(--brand) or var(--status-warning):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("globals.css defines the tokens once, in :root", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    for (const token of ["--brand:", "--brand-foreground:", "--status-warning:", "--brand-strong:", "--brand-strong-foreground:", "--brand-on-dark:", "--brand-on-dark-soft:", "--brand-tint-bg:"]) {
      expect(css.split(token).length - 1, token).toBe(1);
    }
  });
});
