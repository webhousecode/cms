/**
 * F191.7 — manuskriptet ud og ind igen.
 *
 * Christians ord er kravet: «skal selvfølgeligt checkes at et upload
 * indeholder den rigtige syntaks». En prøve på at en GYLDIG fil bliver læst
 * består også hvis parseren accepterer ALT — så hver afvisning har sin egen
 * prøve, og der er en kontrol på at den stadig siger ja til det rigtige.
 */
import { describe, it, expect } from "vitest";
import { tilTekst, fraTekst } from "../podcast/tekstformat";
import type { Replik } from "../podcast/manuscript";

const GYLDIG: Replik[] = [
  { speaker: "airina", text: "Okay, jeg starter med at være uenig." },
  { speaker: "aidan", text: "Det er rigtigt.\n\nOg her er en tom linje midt i." },
  { speaker: "airina", text: "Giv mig et tal." },
  { speaker: "aidan", text: "84 procent. 29 procent stoler på det." },
];

describe("RUNDTUREN — filen der kommer ud, skal gå ind igen uændret", () => {
  it("tegn for tegn, inklusive tomme linjer inde i en replik", () => {
    // Den vigtigste prøve i filen. En rundtur der taber et tegn opdages først
    // når nogen læser højt for penge.
    const svar = fraTekst(tilTekst(GYLDIG, { titel: "Test", nummer: 1, saeson: 1 }));
    expect(svar.ok).toBe(true);
    if (!svar.ok) return;
    expect(svar.replikker).toEqual(GYLDIG);
  });

  it("æ ø å og typografiske anførselstegn overlever", () => {
    const med: Replik[] = [
      { speaker: "aidan", text: "«broberg.ai» — æøå ÆØÅ · 100 % sikkert" },
      ...GYLDIG.slice(1),
    ];
    const svar = fraTekst(tilTekst(med));
    expect(svar.ok && svar.replikker[0]!.text).toBe(med[0]!.text);
  });

  it("Windows-linjeskift ødelægger ikke teksten", () => {
    // \r ville ellers hænge usynligt i enden af hver replik og ende i lyden.
    const svar = fraTekst(tilTekst(GYLDIG).replace(/\n/g, "\r\n"));
    expect(svar.ok && svar.replikker).toEqual(GYLDIG);
  });

  it("små bogstaver i talernavnet accepteres", () => {
    const svar = fraTekst("aidan:\nen\n\nairina:\nto\n\naidan:\ntre\n\nairina:\nfire\n");
    expect(svar.ok).toBe(true);
  });
});

describe("de fem måder en fil kan være forkert på", () => {
  it("ukendt taler — navngiver navnet OG linjen", () => {
    const svar = fraTekst("AIDAN:\nen\n\nJESPER:\nto\n\nAIDAN:\ntre\n\nAIRINA:\nfire\n");
    expect(svar.ok).toBe(false);
    if (svar.ok) return;
    expect(svar.grund).toContain("JESPER");
    expect(svar.grund).toContain("linje 4");
    expect(svar.linje).toBe(4);
  });

  it("tekst før den første taler — med linjenummer", () => {
    const svar = fraTekst("Her står noget løst.\n\nAIDAN:\nen\n");
    expect(svar.ok).toBe(false);
    if (svar.ok) return;
    expect(svar.grund).toContain("linje 1");
    expect(svar.grund).toContain("før den første taler");
  });

  it("en taler uden tekst under sig", () => {
    const svar = fraTekst("AIDAN:\nen\n\nAIRINA:\n\nAIDAN:\ntre\n\nAIRINA:\nfire\n");
    expect(svar.ok).toBe(false);
    if (svar.ok) return;
    expect(svar.grund).toContain("ingen tekst");
  });

  it("«AIDAN: tekst på samme linje» er IKKE en talerlinje", () => {
    // Uden kravet om «intet andet efter kolon» ville denne form tavst blive
    // læst som en taler uden tekst — og det er en helt almindelig måde at
    // skrive et manuskript på, så beskeden skal være til at forstå.
    const svar = fraTekst("AIDAN: det er rigtigt\n");
    expect(svar.ok).toBe(false);
    if (svar.ok) return;
    expect(svar.grund).toContain("før den første taler");
  });

  it("for få replikker — en samtale, ikke et oplæg", () => {
    const svar = fraTekst("AIDAN:\nen\n\nAIRINA:\nto\n");
    expect(svar.ok).toBe(false);
    if (svar.ok) return;
    expect(svar.grund).toContain("2 replik");
  });

  it("tom fil", () => {
    expect(fraTekst("").ok).toBe(false);
    expect(fraTekst("\n\n  \n").ok).toBe(false);
  });

  it("kun kommentarer tæller som tom", () => {
    const svar = fraTekst("# titel\n# format\n");
    expect(svar.ok).toBe(false);
    if (svar.ok) return;
    expect(svar.grund).toContain("ingen replikker");
  });
});

describe("NEGATIV KONTROL — parseren afviser ikke bare alt", () => {
  it("den gyldige fil bliver stadig accepteret", () => {
    // Uden denne ville en fraTekst der ALTID svarer nej bestå hver eneste
    // prøve i blokken ovenfor.
    const svar = fraTekst(tilTekst(GYLDIG));
    expect(svar.ok).toBe(true);
    if (!svar.ok) return;
    expect(svar.replikker).toHaveLength(4);
  });

  it("kommentarer og tomme linjer må gerne stå hvor som helst", () => {
    const svar = fraTekst(
      "# et hoved\n\nAIDAN:\nen\n\n# en note midt i\n\nAIRINA:\nto\n\nAIDAN:\ntre\n\nAIRINA:\nfire\n\n",
    );
    expect(svar.ok && svar.replikker.map((r) => r.text)).toEqual(["en", "to", "tre", "fire"]);
  });
});
