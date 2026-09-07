/**
 * F189.2 — valideringen af modellens svar.
 *
 * Prøven er næsten udelukkende NEGATIVE kontroller, og det er med vilje. En
 * parser der siger ja til alt består enhver prøve der kun fodrer den med et
 * gyldigt manuskript — og fejlen ville først vise sig når et halvt dokument
 * blev læst højt for penge.
 *
 * «Halvt skrevet er værre end ikke skrevet»: et afvist svar må efterlade
 * dokumentet urørt, og det kan kun lade sig gøre hvis afvisningen sker FØR
 * skrivningen. Derfor er parseren streng her, i den rene halvdel.
 */
import { describe, it, expect } from "vitest";
import {
  parseManuskript,
  manuskriptTegn,
  byggManuskriptPrompt,
  RESERVE_TEKSTER,
  VAERTER,
} from "../podcast/manuscript";

const gyldigt = JSON.stringify([
  { speaker: "aidan", text: "Der er en sætning jeg hører tit for tiden." },
  { speaker: "airina", text: "Hvilken?" },
  { speaker: "aidan", text: "«AI'en byggede det på en eftermiddag.»" },
  { speaker: "airina", text: "Og den passer ikke?" },
]);

describe("parseManuskript — det den siger JA til", () => {
  it("læser et gyldigt manuskript", () => {
    const svar = parseManuskript(gyldigt);
    expect(svar.ok).toBe(true);
    expect(svar.ok === true && svar.replikker).toHaveLength(4);
    expect(svar.ok === true && svar.replikker[0]!.speaker).toBe("aidan");
  });

  it("finder JSON'en selv om modellen pakker den ind", () => {
    // Modellen svarer ofte med et ```json-hegn eller en indledende sætning.
    // At finde blokken er parserens opgave, ikke kalderens.
    const pakket = "Her er manuskriptet:\n```json\n" + gyldigt + "\n```\nGod fornøjelse!";
    expect(parseManuskript(pakket).ok).toBe(true);
  });

  it("trimmer replikkerne", () => {
    const medLuft = JSON.stringify([
      { speaker: "aidan", text: "  luft omkring  " },
      { speaker: "airina", text: "og her" },
      { speaker: "aidan", text: "tre" },
      { speaker: "airina", text: "fire" },
    ]);
    const svar = parseManuskript(medLuft);
    expect(svar.ok === true && svar.replikker[0]!.text).toBe("luft omkring");
  });
});

describe("NEGATIVE KONTROLLER — det parseren findes for at nægte", () => {
  const afvist = (raa: string) => {
    const svar = parseManuskript(raa);
    expect(svar.ok).toBe(false);
    return svar.ok === false ? svar.grund : "";
  };

  it("intet JSON i svaret", () => {
    expect(afvist("Beklager, det kan jeg ikke.")).toMatch(/ingen JSON-liste/);
  });

  it("ugyldigt JSON", () => {
    expect(afvist("[{speaker: aidan}]")).toMatch(/kunne ikke læses/);
  });

  it("for få replikker — et afsnit er en samtale, ikke et oplæg", () => {
    const kort = JSON.stringify([
      { speaker: "aidan", text: "en" },
      { speaker: "airina", text: "to" },
    ]);
    expect(afvist(kort)).toMatch(/kun 2 replik/);
  });

  it("en taler vi ikke kender — og fejlen NAVNGIVER ham", () => {
    const fremmed = JSON.stringify([
      { speaker: "aidan", text: "en" },
      { speaker: "soren", text: "to" },
      { speaker: "aidan", text: "tre" },
      { speaker: "airina", text: "fire" },
    ]);
    const grund = afvist(fremmed);
    expect(grund).toContain("soren");
    expect(grund).toContain("aidan");
  });

  it("en TOM replik", () => {
    const tom = JSON.stringify([
      { speaker: "aidan", text: "en" },
      { speaker: "airina", text: "   " },
      { speaker: "aidan", text: "tre" },
      { speaker: "airina", text: "fire" },
    ]);
    expect(afvist(tom)).toMatch(/ingen tekst/);
  });

  it("KUN ÉN taler — et oplæg med en talerangivelse på", () => {
    // Den farligste af dem alle: den er velformet JSON, den har nok replikker,
    // hver replik har tekst. Den ville blive indspillet som «dialog» og først
    // opdages når nogen lyttede.
    const monolog = JSON.stringify([
      { speaker: "aidan", text: "en" },
      { speaker: "aidan", text: "to" },
      { speaker: "aidan", text: "tre" },
      { speaker: "aidan", text: "fire" },
    ]);
    expect(afvist(monolog)).toMatch(/kun «aidan» taler/);
  });

  it("et objekt i stedet for en liste", () => {
    expect(afvist('{"speaker":"aidan","text":"en"}')).toMatch(/ingen JSON-liste/);
  });

  it("en replik der slet ikke er et objekt", () => {
    const skrald = JSON.stringify(["aidan siger noget", "airina svarer", "tre", "fire"]);
    expect(afvist(skrald)).toMatch(/ikke et objekt/);
  });
});

describe("manuskriptTegn — grundlaget for beløbet på knappen", () => {
  it("tæller KUN replik-teksten", () => {
    const svar = parseManuskript(
      JSON.stringify([
        { speaker: "aidan", text: "12345" },
        { speaker: "airina", text: "123" },
        { speaker: "aidan", text: "1" },
        { speaker: "airina", text: "1" },
      ]),
    );
    // Talernavnene sendes som STRUKTUR til dialog-endpointet, ikke som tekst
    // der læses højt — de må derfor ikke tælle med i et beløb vi viser.
    expect(svar.ok === true && manuskriptTegn(svar.replikker)).toBe(10);
  });

  it("et tomt manuskript koster nul", () => {
    expect(manuskriptTegn([])).toBe(0);
  });
});

describe("prompten — rollerne bor i CMS, ikke i koden", () => {
  it("bruger de tekster den får, ikke sine egne", () => {
    const p = byggManuskriptPrompt({
      artikelTitel: "T",
      artikelTekst: "K",
      tekster: { aidanRolle: "AIDAN-ROLLE-X", airinaRolle: "AIRINA-ROLLE-Y", stil: "STIL-Z" },
    });
    expect(p.system).toContain("AIDAN-ROLLE-X");
    expect(p.system).toContain("AIRINA-ROLLE-Y");
    expect(p.system).toContain("STIL-Z");
    // Reserveteksten må ikke sive med ind når en rigtig værdi er givet.
    expect(p.system).not.toContain(RESERVE_TEKSTER.aidanRolle);
  });

  it("navngiver begge værter for modellen", () => {
    const p = byggManuskriptPrompt({
      artikelTitel: "T",
      artikelTekst: "K",
      tekster: RESERVE_TEKSTER,
    });
    for (const v of VAERTER) expect(p.system).toContain(v);
  });

  it("beder om uenighed — en samtale hvor den ene kun nikker er et oplæg", () => {
    const p = byggManuskriptPrompt({
      artikelTitel: "T",
      artikelTekst: "K",
      tekster: RESERVE_TEKSTER,
    });
    expect(p.system).toMatch(/uenige/);
  });

  it("artiklen står i user-beskeden, ikke i system", () => {
    // Systemprompten er instruktionen; artiklen er dataen. Blandes de, kan en
    // artikel der tilfældigvis indeholder instruktions-lignende tekst ændre
    // hvordan modellen opfører sig.
    const p = byggManuskriptPrompt({
      artikelTitel: "MIN-TITEL",
      artikelTekst: "MIN-BRØDTEKST",
      tekster: RESERVE_TEKSTER,
    });
    expect(p.user).toContain("MIN-TITEL");
    expect(p.user).toContain("MIN-BRØDTEKST");
    expect(p.system).not.toContain("MIN-BRØDTEKST");
  });
});
