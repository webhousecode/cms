/**
 * F191 — sponsoren vævet ind i indspilningen.
 *
 * De to ting der kan gå galt her er begge tavse:
 *
 *  1. Lydnøglen kender ikke sponsoren → et afsnit der lige har fået en reklame
 *     genbruger den GAMLE fil uden reklamen. Samme manuskript, samme stemmer,
 *     samme nøgle. Filen findes, afspilleren virker, og det kunden har betalt
 *     for er der bare ikke.
 *  2. Snittet ligger uden for manuskriptet → indspilningen fejler, eller værre,
 *     reklamen lander et sted ingen forventer.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { lydNoegle } from "../podcast/record";
import type { Replik } from "../podcast/manuscript";

const KODE = readFileSync(new URL("../podcast/record.ts", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

const manus: Replik[] = [
  { speaker: "airina", text: "Hvad er det her?" },
  { speaker: "aidan", text: "Det er en podcast." },
  { speaker: "airina", text: "Og hvem betaler?" },
];
const stemmer = { aidan: "jesper", airina: "camilla" };

describe("lydnøglen kender sponsoren", () => {
  it("uden sponsor: samme nøgle som før — den korte vej er uændret", () => {
    expect(lydNoegle(manus, stemmer)).toBe(lydNoegle(manus, stemmer, {}));
  });

  it("MED en sponsor giver en ANDEN nøgle end uden", () => {
    // Dette er den bærende: uden det ville et afsnit der lige har fået en
    // reklame genbruge den gamle fil uden reklamen.
    expect(lydNoegle(manus, stemmer, { slug: "broberg", efterReplik: 1 })).not.toBe(
      lydNoegle(manus, stemmer),
    );
  });

  it("en ANDEN sponsor giver en anden nøgle", () => {
    expect(lydNoegle(manus, stemmer, { slug: "a", efterReplik: 1 })).not.toBe(
      lydNoegle(manus, stemmer, { slug: "b", efterReplik: 1 }),
    );
  });

  it("samme sponsor et ANDET sted giver en anden nøgle", () => {
    // Flytter redaktøren reklamen, er det en ny lyd — ellers ville filen blive
    // genbrugt med reklamen på det gamle sted.
    expect(lydNoegle(manus, stemmer, { slug: "a", efterReplik: 0 })).not.toBe(
      lydNoegle(manus, stemmer, { slug: "a", efterReplik: 2 }),
    );
  });

  it("KONTROL: samme alt giver samme nøgle — ellers ville hver indspilning koste igen", () => {
    expect(lydNoegle(manus, stemmer, { slug: "a", efterReplik: 1 })).toBe(
      lydNoegle(manus, stemmer, { slug: "a", efterReplik: 1 }),
    );
  });
});

describe("snittet kan ikke lande uden for manuskriptet", () => {
  // Reglen læses ud af koden, fordi den bor i en gren der kræver rigtige
  // AI-kald at nå. Den er tre linjer og værd at holde fast i: en placering
  // gemt da manuskriptet var længere, må ikke kunne vælte en indspilning.
  //
  // MÅLT PÅ HELE FILEN, ikke på et udsnit af funktionen. Jeg forsøgte tre
  // gange at klippe kroppen ud og ramte tre forskellige klammer:
  //   1. første «\n}»            → ligger inde i funktionen
  //   2. første «{» efter navnet  → ARGUMENTOBJEKTET { afsnit, stemmer, … }
  //   3. første «{» efter «)»     → RETURTYPEN Promise<StoreSvar<{ … }>>
  // Alle tre gav RØDT på korrekt kode. Markørerne er unikke i filen, så
  // udsnittet købte ingen præcision — kun tre chancer for at måle forkert.

  it("funktionen findes overhovedet — ellers beviser markørerne nedenfor intet", () => {
    expect(KODE).toContain("async function indspilMedSponsor");
    expect(KODE).toContain("sySammen(stykker)");
  });

  it("klemmes ind i manuskriptets længde", () => {
    expect(KODE).toContain("Math.max(1, Math.min(raa + 1, alle.length))");
  });

  it("uden en valgt placering lander reklamen i MIDTEN, ikke i replik 0", () => {
    expect(KODE).toContain("Math.floor(alle.length / 2)");
  });

  it("der optages kun en anden del hvis der ER replikker tilbage", () => {
    // Et ai.podcast()-kald med et tomt manuskript ville koste et kald og
    // returnere ingenting — eller fejle midt i en betalt indspilning.
    expect(KODE).toContain("if (efter.length)");
  });
});

describe("reklamens bytes læses fra mediebiblioteket, ikke over HTTP", () => {
  it("bruger adapterens readFile", () => {
    // Et internt kald til vores egen offentlige adresse ville kræve at
    // serveren kan nå sig selv, og det kan den ikke altid.
    expect(KODE).toContain("adapter.readFile(uden)");
    expect(KODE).not.toContain("await fetch(url)");
  });

  it("en manglende fil giver en besked der siger HVAD der peger forkert", () => {
    expect(KODE).toContain("peger på en fil der ikke er der");
  });
});

describe("overgangens stemme falder ikke tilbage til en fremmed", () => {
  it("der sættes IKKE voiceFallback på overgangen", () => {
    // SDK'ets egen dokumentation advarer mod fallback netop hvor stemmen er en
    // identitet et menneske genkender. Aidan ER den identitet. Hellere en fejl
    // med en besked end et afsnit der pludselig har en fremmed vært.
    const t = KODE.slice(KODE.indexOf("ai.tts({"));
    expect(t.slice(0, t.indexOf("})"))).not.toContain("voiceFallback");
  });

  it("overgangen bruger AIDANS stemme, ikke Airinas", () => {
    const t = KODE.slice(KODE.indexOf("ai.tts({"));
    expect(t.slice(0, t.indexOf("})"))).toContain("voice: stemmer.aidan");
  });
});
