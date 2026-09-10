/* F195.1 — planlæggeren afgør i dansk tid, ikke i maskinens. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDue } from "../tools-scheduler";

/** Et øjeblik skrevet som DANSK vægur, oversat til det UTC-instant det svarer til.
 *  Skrevet ud i det lange for at gøre prøverne læsbare: «01:00 dansk» er hvad
 *  brugeren har sat, og tallet efter er hvad serveren ser. */
const D = (utcIso: string) => new Date(utcIso);

describe("den målte fejl: backup kørte to timer for sent", () => {
  it("03:00 i indstillingen betyder 03:00 DANSK — ikke 03:00 UTC", () => {
    // Sommertid: 03:00 dansk = 01:00 UTC. Før rettelsen var jobbet først
    // forfaldent kl. 03:00 UTC, altså 05:00 dansk — præcis det broberg-ai så.
    expect(isDue("daily", "03:00", undefined, D("2026-09-10T01:00:00Z"))).toBe(true);
  });

  it("NEGATIV KONTROL: to minutter før er det IKKE forfaldent", () => {
    // Uden denne ville en isDue() der altid siger ja bestå prøven ovenfor.
    expect(isDue("daily", "03:00", undefined, D("2026-09-10T00:58:00Z"))).toBe(false);
  });

  it("kl. 03:00 UTC — det gamle tidspunkt — er stadig forfaldent, bare senere", () => {
    expect(isDue("daily", "03:00", undefined, D("2026-09-10T03:00:00Z"))).toBe(true);
  });
});

describe("sommertid prøvet BEGGE veje", () => {
  it("sommer: 02:00 dansk er 00:00 UTC (UTC+2)", () => {
    expect(isDue("daily", "02:00", undefined, D("2026-07-01T00:00:00Z"))).toBe(true);
    expect(isDue("daily", "02:00", undefined, D("2026-07-01T23:58:00Z"))).toBe(false); // 01:58 dansk d. 2.
  });

  it("vinter: 02:00 dansk er 01:00 UTC (UTC+1)", () => {
    expect(isDue("daily", "02:00", undefined, D("2026-01-15T01:00:00Z"))).toBe(true);
    expect(isDue("daily", "02:00", undefined, D("2026-01-15T00:58:00Z"))).toBe(false);
  });

  it("de to forskyder sig FORSKELLIGT — ellers måler prøverne ovenfor intet", () => {
    // Samme UTC-tid, to årstider: den ene er forfalden, den anden ikke.
    const sommer = isDue("daily", "02:00", undefined, D("2026-07-01T00:30:00Z")); // 02:30 dansk
    const vinter = isDue("daily", "02:00", undefined, D("2026-01-15T00:30:00Z")); // 01:30 dansk
    expect(sommer).toBe(true);
    expect(vinter).toBe(false);
    expect(sommer).not.toBe(vinter);
  });
});

describe("kanten kl. 01:00 dansk — hvor den danske dag og UTC-dagen er forskellige", () => {
  // sanneandersen står på 01:00. 01:00 dansk sommertid er 23:00 UTC DAGEN FØR.
  // Det er hele grunden til at «har den kørt i dag» også skal være dansk.
  const nu = D("2026-09-09T23:30:00Z"); // = 10. september kl. 01:30 dansk

  it("er forfaldent: 01:30 dansk er efter 01:00", () => {
    expect(isDue("daily", "01:00", undefined, nu)).toBe(true);
  });

  it("en kørsel tidligere PÅ SAMME DANSKE DAG spærrer", () => {
    // 23:10 UTC d. 9. = 01:10 dansk d. 10. Samme danske dag som `nu`.
    expect(isDue("daily", "01:00", "2026-09-09T23:10:00Z", nu)).toBe(false);
  });

  it("en kørsel dagen før i DANSK forstand spærrer IKKE", () => {
    // 23:10 UTC d. 8. = 01:10 dansk d. 9. Forrige danske dag.
    expect(isDue("daily", "01:00", "2026-09-08T23:10:00Z", nu)).toBe(true);
  });

  it("og UTC ville have svaret modsat på begge — det er fejlen", () => {
    const utcDag = (s: string) => s.slice(0, 10);
    expect(utcDag("2026-09-09T23:10:00Z")).toBe("2026-09-09");
    expect(utcDag("2026-09-09T23:30:00Z")).toBe("2026-09-09"); // UTC: samme dag
    // men dansk: begge er den 10. — så UTC og dansk er uenige netop her.
  });
});

describe("ugentlig kører på DANSK mandag", () => {
  it("mandag 06:00 dansk er forfaldent", () => {
    // 2026-09-14 er en mandag. 06:00 dansk = 04:00 UTC.
    expect(isDue("weekly", "06:00", undefined, D("2026-09-14T04:00:00Z"))).toBe(true);
  });

  it("søndag er det ikke", () => {
    expect(isDue("weekly", "06:00", undefined, D("2026-09-13T04:00:00Z"))).toBe(false);
  });

  it("MANDAG DANSK, SØNDAG UTC — den halvdel en klokkeslæts-rettelse ville misse", () => {
    // 23:30 UTC søndag d. 13. = 01:30 dansk MANDAG d. 14.
    // getDay() på serverens ur ville svare søndag og springe kørslen over.
    const nu = D("2026-09-13T23:30:00Z");
    expect(nu.getUTCDay()).toBe(0); // søndag i UTC
    expect(isDue("weekly", "01:00", undefined, nu)).toBe(true); // mandag i DK
  });
});

describe("den siger fra frem for at gætte", () => {
  it("«off» kører aldrig", () => {
    expect(isDue("off", "03:00", undefined, D("2026-09-10T12:00:00Z"))).toBe(false);
  });

  it("et ugyldigt tidspunkt kører aldrig", () => {
    // Den gamle kode gav setHours(NaN) → Invalid Date → sammenligningen blev
    // false → jobbet kørte. Den sikre retning er at lade være.
    expect(isDue("daily", "", undefined, D("2026-09-10T12:00:00Z"))).toBe(false);
    expect(isDue("daily", "ikke-et-klokkeslæt", undefined, D("2026-09-10T12:00:00Z"))).toBe(false);
  });
});

describe("PORTEN: planlæggeren må ikke læse maskinens ur igen", () => {
  const kilde = readFileSync(fileURLToPath(new URL("../tools-scheduler.ts", import.meta.url)), "utf8");

  it("filen findes og er planlæggeren — ellers måler porten ingenting", () => {
    expect(kilde.length).toBeGreaterThan(2_000);
    expect(kilde).toContain("dansk-tid");
    expect(kilde).toContain("isDue");
  });

  it("ingen setHours / getDay / toDateString i KODEN", () => {
    // Kommentarer må gerne nævne dem — de forklarer netop hvad der stod her.
    const udenKommentarer = kilde
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(udenKommentarer.match(/\.setHours\s*\(/g) ?? []).toEqual([]);
    expect(udenKommentarer.match(/\.getDay\s*\(/g) ?? []).toEqual([]);
    expect(udenKommentarer.match(/\.toDateString\s*\(/g) ?? []).toEqual([]);
  });
});
