/**
 * F189.2 — I/O-halvdelen.
 *
 * To slags prøver, og grunden til hver står ved den:
 *
 *  · REN LOGIK (artikelTekst, _laesData) prøves direkte.
 *  · RÆKKEFØLGEN prøves på kilden. `genererManuskript` kræver et CMS, en
 *    site-config og en AI-udbyder; en prøve der mocker alle tre ville bevise
 *    mocken. Den egenskab der betyder noget — at valideringen sker FØR
 *    skrivningen — er en ordning af to kald, og den kan læses.
 *    Runtime-beviset er F189.7's kørsel udefra.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artikelTekst } from "../podcast/generate";
import { _laesData, PODCAST_SAMLING } from "../podcast/store";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const kilde = (rel: string) => fs.readFileSync(path.join(PKG_ROOT, rel), "utf-8");

describe("artikelTekst — modellen skal læse indholdet, ikke vores HTML", () => {
  it("stripper markup", () => {
    const ud = artikelTekst({ content: "<p>Hej <strong>der</strong></p>" });
    expect(ud).toBe("Hej der");
    expect(ud).not.toContain("<");
  });

  it("samler de felter en artikel faktisk bruger", () => {
    const ud = artikelTekst({ lead: "manchet", content: "brødtekst" });
    expect(ud).toContain("manchet");
    expect(ud).toContain("brødtekst");
  });

  it("springer tomme og ikke-tekstlige felter over", () => {
    expect(artikelTekst({ lead: "", content: "kun denne", body: 42 })).toBe("kun denne");
  });

  it("en artikel uden brugbare felter giver tom streng — ikke «undefined»", () => {
    // Bliver den til strengen "undefined", ryger ordet med i prompten og
    // modellen skriver et afsnit om det.
    expect(artikelTekst({})).toBe("");
    expect(artikelTekst({ title: "kun en titel" })).toBe("");
  });
});

describe("_laesData — dataen kommer fra et dokument nogen kan have redigeret", () => {
  it("et tomt dokument giver et brugbart afsnit, ikke undefined-felter", () => {
    const d = _laesData({});
    expect(d.tilstand).toBe("kladde");
    expect(d.replikker).toEqual([]);
    expect(d.titel).toBe("");
  });

  it("en UGYLDIG tilstand falder til «kladde» frem for at forgifte maskinen", () => {
    // En tilstandsmaskine der får undefined ind svarer «ukendt tilstand» på
    // ALT, og fejlen ville se ud som om afsnittet var ødelagt.
    expect(_laesData({ tilstand: "færdig" }).tilstand).toBe("kladde");
    expect(_laesData({ tilstand: 3 }).tilstand).toBe("kladde");
  });

  it("en gyldig tilstand bevares", () => {
    expect(_laesData({ tilstand: "godkendt" }).tilstand).toBe("godkendt");
  });

  it("valgfrie felter udelades helt frem for at stå som undefined", () => {
    const d = _laesData({ tilstand: "kladde" });
    expect("lydUrl" in d).toBe(false);
    expect("faktiskPrisUsd" in d).toBe(false);
  });

  it("replikker der ikke er en liste bliver til en tom liste", () => {
    expect(_laesData({ replikker: "ikke en liste" }).replikker).toEqual([]);
  });
});

describe("rækkefølgen — valideringen SKAL ske før skrivningen", () => {
  const gen = kilde("src/lib/podcast/generate.ts");

  it("parseManuskript kaldes før skrivAfsnit", () => {
    const validering = gen.indexOf("parseManuskript(raa)");
    const skrivning = gen.indexOf("skrivAfsnit(args.afsnitSlug");
    expect(validering, "parseManuskript findes ikke").toBeGreaterThan(-1);
    expect(skrivning, "skrivAfsnit findes ikke").toBeGreaterThan(-1);
    // Halvt skrevet ser ud som om der er noget. Det er hele grunden til at
    // afvisningen ligger før den eneste linje der rører dokumentet.
    expect(validering).toBeLessThan(skrivning);
  });

  it("et afvist svar RETURNERER — den skriver ikke bagefter alligevel", () => {
    expect(gen).toMatch(/if \(!parset\.ok\) \{\s*return/);
  });

  it("AI-kaldet går gennem @broberg/ai-sdk, ikke en rå udbyder", () => {
    expect(gen).toContain("getAI()");
    expect(gen).toContain('purpose: "podcast.manuscript"');
    expect(gen).not.toMatch(/from ["']@?(anthropic|openai|elevenlabs)/);
  });

  it("en genskrivning på et GODKENDT afsnit afvises", () => {
    expect(gen).toMatch(/tilstand === "godkendt"/);
    expect(gen).toMatch(/træk godkendelsen tilbage/);
  });
});

describe("ship-dark — motoren opretter ikke samlingen selv", () => {
  const store = kilde("src/lib/podcast/store.ts");

  it("hver handling kræver at samlingen er erklæret", () => {
    // Tre indgange, tre tjek. Ét glemt sted er et sted der svarer «Unknown
    // collection» i stedet for at sige hvad der mangler.
    expect(store.match(/kraevPodcastSamling\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("beskeden siger hvad der mangler OG hvorfor vi ikke gør det selv", () => {
    expect(store).toContain(PODCAST_SAMLING);
    expect(store).toMatch(/opretter den ikke selv/);
    expect(store).toMatch(/tager hele sitet ned/);
  });

  it("skrivningen LÆSER TILBAGE fra et frisk opslag", () => {
    // En skrivning der 200'er og ikke landede ser identisk ud herfra.
    expect(store).toMatch(/const efter = await cms\.content\.findBySlug/);
  });

  it("en delvis skrivning FLETTER frem for at erstatte", () => {
    expect(store).toMatch(/\{ \.\.\.laesData\(findes\.data\), \.\.\.aendringer \}/);
  });
});
