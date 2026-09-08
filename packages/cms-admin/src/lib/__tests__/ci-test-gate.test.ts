import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * F178.1 — a failing suite must LOOK like a failing suite.
 *
 * Every workflow that ran tests did it as:
 *
 *   pnpm test:run || echo "⚠️ Tests with native modules skipped on CI"
 *
 * written into the first deployment commit rather than after an observed
 * failure. Two faults, and the second is the one that mattered:
 *
 *  1. `||` swallowed EVERY failure, so a real regression was announced in the
 *     same reassuring words as a limitation someone chose to live with.
 *  2. `pnpm test:run` from the repo ROOT has never worked. Measured 28 Aug
 *     2026: exit 1, 45 test FILES failing to load while 1505 tests pass — the
 *     root workspace collects Playwright e2e specs and stale
 *     `.next/standalone` build artefacts as unit tests, and cms-admin's suite
 *     does not load at all because the `@/` alias is not applied there.
 *
 * So the step that gates a deploy never ran the tests it named, and said so in
 * words that read like a considered exception. This test keeps that shape out.
 *
 * F193.4 — DEN ER NU ARMET, og de to sidste prøver herunder er skiftet ud i
 * takt med det. Fra 28. august til 8. september bar tre trin
 * `continue-on-error: true`: begge enheds-suiter i publish.yml og cms-admins i
 * _release-build.yml. Hvert flag havde F178.3 som betingelse for at blive
 * fjernet, og F178.3 blev aldrig lavet — så porten stod inert i elleve dage
 * mens kommentaren over den lovede at det var midlertidigt.
 *
 * Derfor kræver vagten ikke længere at et undtaget trin NAVNGIVER sit kort.
 * Den forbyder undtagelsen. En undtagelse med en begrundelse er stadig en
 * undtagelse, og begrundelsen er præcis det der får den til at overleve.
 */
const WORKFLOWS = join(process.cwd(), "../../.github/workflows");
const readRaw = (f: string) => readFileSync(join(WORKFLOWS, f), "utf8");

/**
 * The file with its COMMENT lines removed.
 *
 * Caught by this test on its first run: the step I wrote quotes the banned
 * command inside its own explanatory comment, and the guard failed on it. A
 * guard that cannot tell a comment from a command counts an explanation as
 * behaviour — the same trap the fleet hit in buddy (a struct-guard that matched
 * raw source counted an import line as a call). Explaining a mistake must not
 * be indistinguishable from making it.
 */
const read = (f: string) =>
  readRaw(f)
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
const all = () => readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));

describe("a CI test step cannot swallow its own failure", () => {
  it("no workflow pipes a test run into `|| echo`", () => {
    for (const f of all()) {
      const src = read(f);
      const swallowed = src
        .split("\n")
        .filter((l) => /vitest|test:run|pnpm test/.test(l) && /\|\|/.test(l));
      expect(
        swallowed,
        `${f} swallows a test failure with \`||\` — a real regression would be reported as a skip`,
      ).toEqual([]);
    }
  });

  it("the reassuring native-modules line is gone everywhere", () => {
    // The exact wording that made a permanently broken step look intentional.
    for (const f of all()) {
      expect(read(f), `${f} still claims tests were "skipped" on CI`)
        .not.toMatch(/Tests with native modules skipped/);
    }
  });

  it("deploy and publish run the per-package suites that actually work", () => {
    // `pnpm test:run` from the root cannot load cms-admin's tests at all, so a
    // workflow using it is not running the suite it names.
    //
    // F193.3: deploy.yml no longer runs them ITSELF — it calls test.yml as its
    // gate, so there is ONE definition of "the suites are green" instead of two
    // that can drift. The requirement is unchanged (the deploy path runs the
    // real suites); only where the commands live moved, so the assertion
    // FOLLOWS the delegation rather than pinning the old mechanism.
    const kilder = (f: string): string[] => {
      const src = read(f);
      const kaldt = [...src.matchAll(/uses:\s*\.\/\.github\/workflows\/([\w.-]+)/g)].map((m) => m[1]!);
      return [src, ...kaldt.map(read)];
    };
    for (const f of ["deploy.yml", "publish.yml"]) {
      const alle = kilder(f).join("\n");
      expect(alle, `${f} runs the cms core suite (directly or via a called workflow)`)
        .toMatch(/cd packages\/cms && npx vitest run/);
      expect(alle, `${f} runs the cms-admin suite (directly or via a called workflow)`)
        .toMatch(/cd packages\/cms-admin && npx vitest run/);
    }
  });

  it("KONTROL: delegationen følges faktisk", () => {
    // Uden denne ville prøven ovenfor bestå hvis regex'en for `uses:` aldrig
    // matchede — og deploy.yml ville se ud som om den kørte suiterne selv.
    const src = read("deploy.yml");
    expect(src, "deploy.yml kalder ikke længere test.yml — er porten koblet fra?")
      .toMatch(/uses:\s*\.\/\.github\/workflows\/test\.yml/);
    expect(read("test.yml")).toMatch(/cd packages\/cms-admin && npx vitest run/);
  });

  it("INGEN test-prøve må være ikke-blokerende", () => {
    // F193.4. Den tidligere udgave tillod undtagelsen så længe den navngav et
    // kort der ville fjerne den. Målt: tre trin gjorde præcis det, kortet blev
    // aldrig lavet, og npm-udgivelsen gik igennem uanset hvor mange prøver der
    // var røde — i elleve dage.
    //
    // Kun DIREKTIVET tæller, ikke en kommentar der omtaler det: en vagt der
    // ikke kan se forskel straffer den der skriver begrundelsen ned.
    const slugere: string[] = [];
    for (const f of all()) {
      const linjer = readRaw(f).split("\n");
      linjer.forEach((linje, i) => {
        if (!/^\s*continue-on-error:\s*true\s*$/.test(linje)) return;
        const trin = linjer.slice(Math.max(0, i - 20), i + 5).join("\n");
        if (!/vitest|test:run|pnpm test|playwright/.test(trin)) return; // ikke et test-trin
        slugere.push(`${f}:${i + 1}`);
      });
    }
    expect(slugere.join(", ")).toBe("");
  });

  it("KONTROL: vagten kan SE et ikke-blokerende test-trin", () => {
    // Uden denne består prøven ovenfor hvis regex'en aldrig matcher noget.
    const attrap = [
      "      - name: Tests",
      "        continue-on-error: true",
      "        run: cd packages/cms && npx vitest run",
    ];
    const ramt = attrap.some((l, i) =>
      /^\s*continue-on-error:\s*true\s*$/.test(l) &&
      /vitest/.test(attrap.slice(Math.max(0, i - 20), i + 5).join("\n")));
    expect(ramt).toBe(true);
  });

  it("KONTROL: der findes overhovedet test-trin at vagte", () => {
    // En scanning der ikke finder noget ser ud som et rent repo.
    const antal = all().reduce(
      (n, f) => n + readRaw(f).split("\n").filter((l) => /npx vitest run|npx playwright test/.test(l)).length,
      0,
    );
    expect(antal, "ingen workflow kører prøver — vagten måler på ingenting").toBeGreaterThanOrEqual(5);
  });
});
