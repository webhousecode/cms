import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * `"^0.13.0"` reads as "0.13 or newer". It is not: on a 0.x version the caret
 * pins the MINOR, so it can reach 0.13.9 and never 0.14.0. A dependency you
 * believe is keeping up stands still until someone types a new number by hand.
 *
 * Measured 25 Aug 2026 after upmetrics fell into it themselves: five of ours
 * were frozen, the worst being @broberg/ai-sdk on 0.13.0 while 0.28.0 was out —
 * fifteen minors on the package that carries cost tracking, GDPR routing and
 * the model-availability gate for every LLM call in cms.
 *
 * This test does NOT ask npm anything. A test that needs the network is a test
 * that goes red on a train, and one nobody trusts is one somebody deletes. It
 * asserts something better: every ^0.x pin is a WRITTEN DECISION. Add one
 * without saying why it is safe to freeze, and this fails.
 *
 * `scripts/check-frozen-deps.ts` is the other half — it asks the registry
 * whether any of them has since moved. That one needs the network, so it is a
 * script you run, not a test that blocks.
 */

/**
 * Every ^0.x dependency, with the reason it is allowed to be frozen and the
 * version it was last measured against. Keep the note honest: "not looked at"
 * is a legitimate entry and far better than a comforting sentence.
 */
const LEDGER: Record<string, string> = {
  "@upmetrics/sdk":
    "Bumped to 0.4.1 on 2026-08-25. Fleet-owned; upmetrics tells us when to move.",
  "@broberg/mail":
    "Pinned EXACTLY on 0.1.0 while 0.5.0 exists. Not looked at — the mail gate " +
    "was hardened against 0.1.0's behaviour, so the bump is its own piece of work.",
  "@broberg/cms-chat-client":
    "0.4.14 vs 0.4.20 — same minor, so the caret DOES reach it. Not frozen.",
  "class-variance-authority": "On the newest version (0.7.1).",
  "next-themes": "On the newest version (0.4.6).",
  "tiptap-markdown": "On the newest version (0.9.0).",

  // ── Knowingly behind. Each has a card; none is a shrug. ──
  "@broberg/ai-sdk":
    "Bumped 0.13.0 → 0.28.0 on 2026-08-25 (F172.2). Cost tracking stays on OUR " +
    "explicit sink — from 0.24 a bare createAI() auto-attaches its own, and two " +
    "sinks would count every call twice in production with no error anywhere.",
  "drizzle-orm":
    "FROZEN on 0.38.x, newest 0.45.2. F172 — touches the database; cms and " +
    "cms-admin must move together and the schema re-checked.",
  sharp:
    "FROZEN on 0.34.5, newest 0.35.3. F172 — native binary, so the risk is the " +
    "Docker build rather than the API.",
  citty: "FROZEN on 0.1.6, newest 0.2.2. F172 — CLI only, lowest risk of the five.",
  "lucide-react":
    "FROZEN on 0.577, newest 1.34.0. F172 — 0.x → 1.x is effectively a major; " +
    "icon names may be gone. Deliberately last.",
};

function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("repo root not found");
}

/**
 * A caret is not the only way to freeze. `"@broberg/ai-sdk": "0.13.0"` — no
 * caret at all — is frozen HARDER, and the first version of this test looked
 * only for `^0.`, so cms-admin's exact pin walked straight past the ledger
 * while cms-ai's caret was caught. Found the same evening, bumping that very
 * package. Both shapes count now.
 */
function caretZeroPins(): Array<{ name: string; range: string; where: string }> {
  const root = repoRoot();
  const manifests = [path.join(root, "package.json")];
  const pkgDir = path.join(root, "packages");
  for (const entry of readdirSync(pkgDir)) {
    const p = path.join(pkgDir, entry, "package.json");
    if (existsSync(p)) manifests.push(p);
  }
  const out: Array<{ name: string; range: string; where: string }> = [];
  for (const file of manifests) {
    const pkg = JSON.parse(readFileSync(file, "utf-8")) as Record<string, Record<string, string>>;
    for (const section of ["dependencies", "devDependencies"]) {
      for (const [name, range] of Object.entries(pkg[section] ?? {})) {
        if (/^\^?0\./.test(range)) {
          out.push({ name, range, where: path.relative(root, file) });
        }
      }
    }
  }
  return out;
}

describe("0.x dependencies", () => {
  it("every one is a written decision, not an accident", () => {
    const undocumented = caretZeroPins()
      .filter((p) => !LEDGER[p.name])
      .map((p) => `${p.name}@${p.range} (${p.where})`);

    expect(
      undocumented,
      "A ^0.x range pins the MINOR — these will never move on their own. Add each " +
        "to LEDGER in this file with the reason it is safe to freeze:\n  " +
        undocumented.join("\n  "),
    ).toEqual([]);
  });

  it("the ledger has no entries for dependencies that are gone", () => {
    const present = new Set(caretZeroPins().map((p) => p.name));
    const stale = Object.keys(LEDGER).filter((n) => !present.has(n));
    expect(stale, `no longer pinned as 0.x — remove from LEDGER: ${stale.join(", ")}`).toEqual([]);
  });

  it("no entry is an empty gesture", () => {
    const thin = Object.entries(LEDGER).filter(([, why]) => why.trim().length < 20);
    expect(thin.map(([n]) => n), "a reason that short is not a reason").toEqual([]);
  });
});
