/**
 * F189.3 — prisen og før-flyvnings-tjekket.
 *
 * Begge er FØRSTEKLASSES dele af API'et. Kan et site ikke spørge om dem, kan
 * det ikke vise beløbet på sin egen knap eller tjeklisten før studiet — og så
 * er «komplet API» ikke sandt.
 *
 * Den vigtigste prøve i filen er den der kræver at «ikke slået op» IKKE tæller
 * som «i orden». Et tjek der stiltiende består når ingen har spurgt, er værre
 * end intet tjek: det ser grønt ud.
 */
import { describe, it, expect } from "vitest";
import { estimat, foerFlyvning, PRIS_PR_1000_TEGN_USD } from "../podcast/preflight";
import type { Replik } from "../podcast/manuscript";

const replik = (tekst: string): Replik => ({ speaker: "aidan", text: tekst });
const manuskript = (tegn: number): Replik[] => [replik("x".repeat(tegn))];

describe("estimat — bruger ingen penge", () => {
  it("regner pris ud fra tegn", () => {
    const e = estimat(manuskript(10_000));
    expect(e.tegn).toBe(10_000);
    expect(e.prisUsd).toBe(1); // 10 × $0,10 — satsen MÅLT mod regningen 8/9, se preflight.ts
  });

  it("runder OP til øre — et for lavt beløb på en knap er værre end et lidt for højt", () => {
    const e = estimat(manuskript(1_001));
    expect(e.prisUsd).toBeGreaterThanOrEqual((1001 / 1000) * PRIS_PR_1000_TEGN_USD);
    expect(String(e.prisUsd).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it("et tomt manuskript koster nul, ikke NaN", () => {
    // toMatchObject og ikke toEqual: prøven skal fejle hvis et TAL bliver NaN,
    // ikke hver gang estimatet får et nyt felt. Den blev rød da kroner og kurs
    // kom med (Christian 8/9), og der var intet i vejen.
    expect(estimat([])).toMatchObject({ tegn: 0, prisUsd: 0, minutter: 0 });
    // Kronebeløbet må heller ikke blive NaN på et tomt manuskript.
    expect(estimat([]).prisDkk).toBe("0,00 kr");
  });

  it("anslår en længde man kan skrive på en skærm", () => {
    expect(estimat(manuskript(9_000)).minutter).toBeGreaterThan(5);
    expect(estimat(manuskript(9_000)).minutter).toBeLessThan(20);
  });
});

const grundlag = {
  replikker: manuskript(500),
  stemmer: ["soren", "camilla"],
  levendeStemmer: ["soren", "camilla", "jesper"],
  godkendt: true,
};

describe("foerFlyvning — alt der kan fejle NÅR vi trykker, spurgt FØR", () => {
  it("alt i orden → klar", () => {
    const f = foerFlyvning(grundlag);
    expect(f.klar).toBe(true);
    expect(f.tjek.every((t) => t.ok)).toBe(true);
  });

  it("IPA-rækker fanges og NAVNGIVES — den målte forhindring", () => {
    // ElevenLabs-adapteren KASTER på ipa. Fanget her koster det ingenting;
    // fanget under indspilningen er pengene brugt.
    const f = foerFlyvning({
      ...grundlag,
      udtaler: [
        { word: "harness", ipa: "ˈhɑːnəs" },
        { word: "lens", ipa: "lɛnz" },
        { word: "SaaS", alias: "sas" },
      ],
    });
    expect(f.klar).toBe(false);
    const t = f.tjek.find((x) => x.navn === "Udtale-ordbogen er ren")!;
    expect(t.ok).toBe(false);
    expect(t.detalje).toContain("harness");
    expect(t.detalje).toContain("lens");
    expect(t.detalje).not.toContain("SaaS"); // alias er i orden
    expect(t.detalje).toMatch(/lyd-alias/); // siger hvad man gør
  });

  it("en ordbog med KUN alias består", () => {
    const f = foerFlyvning({ ...grundlag, udtaler: [{ word: "SaaS", alias: "sas" }] });
    expect(f.tjek.find((x) => x.navn === "Udtale-ordbogen er ren")!.ok).toBe(true);
  });

  it("NEGATIV KONTROL: «ikke slået op» tæller IKKE som «i orden»", () => {
    // Den vigtigste prøve i filen. Uden den ville et tjek ingen har kørt se
    // grønt ud, og hele tjeklisten ville være pynt.
    const { levendeStemmer, ...udenOpslag } = grundlag;
    void levendeStemmer;
    const f = foerFlyvning(udenOpslag);
    const t = f.tjek.find((x) => x.navn === "Stemmerne svarer")!;
    expect(t.ok).toBe(false);
    expect(t.detalje).toMatch(/ikke slået op/);
    expect(f.klar).toBe(false);
  });

  it("en DØD stemme fanges og navngives", () => {
    const f = foerFlyvning({ ...grundlag, levendeStemmer: ["soren"] });
    const t = f.tjek.find((x) => x.navn === "Stemmerne svarer")!;
    expect(t.ok).toBe(false);
    expect(t.detalje).toContain("camilla");
  });

  it("én stemme er ikke en samtale", () => {
    const f = foerFlyvning({ ...grundlag, stemmer: ["soren"] });
    expect(f.tjek.find((x) => x.navn === "Begge stemmer er valgt")!.ok).toBe(false);
  });

  it("et tomt manuskript fanges", () => {
    const f = foerFlyvning({ ...grundlag, replikker: [] });
    expect(f.tjek.find((x) => x.navn === "Manuskriptet har indhold")!.ok).toBe(false);
  });

  it("uden godkendelse er intet klar — også når alt andet er grønt", () => {
    const f = foerFlyvning({ ...grundlag, godkendt: false });
    expect(f.klar).toBe(false);
    expect(f.tjek.find((x) => x.navn === "Din godkendelse")!.ok).toBe(false);
    // De øvrige er stadig grønne: tjeklisten skal vise HVAD der mangler,
    // ikke bare at noget gør.
    expect(f.tjek.filter((t) => t.ok).length).toBeGreaterThanOrEqual(3);
  });

  it("klar er en OG af alle tjek — ikke af nogle af dem", () => {
    for (const brudt of [
      { replikker: [] },
      { stemmer: [] },
      { godkendt: false },
      { udtaler: [{ word: "x", ipa: "y" }] },
    ]) {
      expect(foerFlyvning({ ...grundlag, ...brudt }).klar, JSON.stringify(brudt)).toBe(false);
    }
  });

  it("hvert fejlende tjek bærer en detalje man kan handle på", () => {
    const f = foerFlyvning({ replikker: [], stemmer: [], godkendt: false });
    for (const t of f.tjek.filter((x) => !x.ok)) {
      expect(t.detalje.length, t.navn).toBeGreaterThan(10);
    }
  });
});

describe("prisen er MÅLT mod regningen, ikke taget fra en prisliste", () => {
  it("satsen er den målte $0,10 pr. 1.000 råtegn", () => {
    // $1,10 / 11.000 tegn på kontoens egen forbrugsside, 2.-8. september 2026.
    expect(PRIS_PR_1000_TEGN_USD).toBeCloseTo(0.1, 5);
  });

  it("prøve-afsnittets 4.764 tegn koster $0,48 — ikke $0,72", () => {
    // Det gamle tal stod på knappen i to dage. En pris der er 50 % for høj er
    // ikke harmløs: den afskrækker fra en handling der er billigere end den ser ud.
    const e = estimat([{ speaker: "aidan", text: "x".repeat(4764) }]);
    expect(e.tegn).toBe(4764);
    expect(e.prisUsd).toBe(0.48);
  });

  it("KONTROL: satsen ganges faktisk på tegnene — en fast pris ville ikke bestå", () => {
    const lille = estimat([{ speaker: "aidan", text: "x".repeat(1000) }]);
    const stor = estimat([{ speaker: "aidan", text: "x".repeat(10000) }]);
    expect(stor.prisUsd).toBeCloseTo(lille.prisUsd * 10, 2);
  });
});
