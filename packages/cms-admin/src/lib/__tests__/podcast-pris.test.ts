/**
 * F189.3 — kroner, og at satsen kun findes ÉT sted.
 *
 * Christian 8/9: «Omregn til DKK». Den farlige del er ikke omregningen — det er
 * at prisen før stod to steder: i motoren og som et bart `0.1` i
 * sponsor-skærmen. Med en valutakurs oveni ville der have været fire tal om
 * hvad ét tryk koster.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dkk, estimat, estimatForTekst, USD_TIL_DKK, PRIS_PR_1000_TEGN_USD } from "../podcast/preflight";

const KODE = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const UDEN_KOMMENTAR = (f: string) =>
  KODE(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("kroner, skrevet dansk", () => {
  it("komma som decimaltegn, ikke punktum", () => {
    // «1.54 kr» er engelsk og læses som halvandet TUSINDE af en der skimmer.
    // Beløbet står på en knap der bruger penge.
    expect(dkk(0.24)).toBe("1,54 kr");
    expect(dkk(0.24)).not.toContain(".");
  });

  it("altid to decimaler — også under en krone", () => {
    // Ellers ville «0 kr» stå på en knap der faktisk koster noget.
    expect(dkk(0.05)).toBe("0,32 kr");
  });

  it("samme form uanset størrelse", () => {
    expect(dkk(1.48)).toBe("9,52 kr");
  });

  it("KONTROL: den regner faktisk om — den sætter ikke bare «kr» på dollartallet", () => {
    // Uden denne ville en dkk() der returnerede `${usd} kr` bestå de øvrige,
    // hvis man ikke så efter. 0,24 og 1,54 er forskellige tal.
    expect(dkk(1)).toBe(`${USD_TIL_DKK.toFixed(2).replace(".", ",")} kr`);
    expect(dkk(0.24)).not.toContain("0,24");
  });
});

describe("estimatet bærer BÅDE beløbet, kursen og dens dato", () => {
  const e = estimatForTekst("x".repeat(2379));

  it("kroner er med, færdigformateret", () => {
    expect(e.prisDkk).toBe(dkk(e.prisUsd));
  });

  it("kursen er med, så en klient kan omregne et HISTORISK beløb", () => {
    // Uden den skulle skærmen have sin egen kopi af tallet for at kunne vise
    // «kostede X kr» om en indspilning fra i går.
    expect(e.kurs).toBe(USD_TIL_DKK);
  });

  it("datoen er med — en kurs uden dato lader som om den er evig", () => {
    expect(e.kursMaalt).toMatch(/\d{4}/);
  });

  it("estimatForTekst og estimat er ENIGE på samme tegn", () => {
    const via = estimat([{ speaker: "aidan", text: "x".repeat(2379) }]);
    expect(estimatForTekst("x".repeat(2379)).prisUsd).toBe(via.prisUsd);
  });
});

describe("SATSEN OG KURSEN FINDES ÉT STED", () => {
  it("reklame-fanen har ikke sit eget sats-tal", () => {
    // Den havde `(n / 1000) * 0.1` skrevet ind i sig. Et bart 0.1 i en UI-fil
    // er en anden sandhed om prisen end motorens.
    const k = UDEN_KOMMENTAR("../../components/podcast/reklamer-fane.tsx");
    expect(k).not.toContain("/ 1000");
    expect(k).not.toContain("0.1");
  });

  it("ingen skærm har sin egen valutakurs", () => {
    for (const f of [
      "../../components/podcast/reklamer-fane.tsx",
      "../../app/admin/(workspace)/podcast/[slug]/page.tsx",
    ]) {
      expect(UDEN_KOMMENTAR(f), f).not.toContain("6.43");
    }
  });

  it("skærmene henter prisen fra API'et", () => {
    expect(KODE("../../components/podcast/reklamer-fane.tsx"))
      .toContain("/api/podcast/estimate");
    expect(KODE("../../app/admin/(workspace)/podcast/[slug]/page.tsx"))
      .toContain("estimat.prisDkk");
  });

  it("KONTROL: begge tal er sat, så prøverne ovenfor ikke består på nul", () => {
    expect(PRIS_PR_1000_TEGN_USD).toBeGreaterThan(0);
    expect(USD_TIL_DKK).toBeGreaterThan(1);
  });
});
