/**
 * F191.6 — ordbogen når frem, og den når frem MED indhold.
 *
 * Den farlige prøve her er den der bekræfter at `pronunciations` blev sendt.
 * Den består også hvis feltet var en TOM liste — og en tom ordbog ændrer
 * ingenting, mens prøven ser grøn ud. Hver prøve har derfor en modpart der
 * fejler hvis listen tømmes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { tilElevenLabs } from "../podcast/udtale";

const KODE = (f: string) =>
  readFileSync(new URL(`../podcast/${f}`, import.meta.url), "utf8");

describe("hvad der faktisk kan sendes til ElevenLabs", () => {
  it("alias-rækker går igennem — og listen bliver IKKE tom", () => {
    const ud = tilElevenLabs([
      { word: "et-domæne.dk", alias: "et domæne punktum d k" },
      { word: "ETORD", alias: "E T O R D" },
    ]);
    expect(ud).toHaveLength(2);
    expect(ud[0]).toEqual({ word: "et-domæne.dk", alias: "et domæne punktum d k" });
  });

  it("IPA-rækker fjernes — adapteren KASTER på dem", () => {
    // Uden frafiltreringen vælter én IPA-række hele indspilningen, efter at
    // pengene er brugt på de foregående stykker.
    const ud = tilElevenLabs([
      { word: "etord", ipa: "ˈetˌɔːd" },
      { word: "andet", alias: "ann det" },
    ]);
    expect(ud.map((r) => r.word)).toEqual(["andet"]);
  });

  it("en række uden lydskrift tæller ikke med", () => {
    expect(tilElevenLabs([{ word: "bar" }])).toEqual([]);
    expect(tilElevenLabs([{ word: "bar", alias: "   " }])).toEqual([]);
  });

  it("en række uden ord tæller ikke med", () => {
    expect(tilElevenLabs([{ word: "  ", alias: "noget" }])).toEqual([]);
  });

  it("mellemrum trimmes i BEGGE felter", () => {
    expect(tilElevenLabs([{ word: " ord ", alias: " lyd " }])).toEqual([
      { word: "ord", alias: "lyd" },
    ]);
  });

  it("NEGATIV KONTROL: filteret er ikke bare «altid tom»", () => {
    // Uden denne ville en tilElevenLabs der returnerer [] bestå de tre
    // fjernelses-prøver ovenfor.
    expect(tilElevenLabs([{ word: "a", alias: "b" }])).toHaveLength(1);
  });
});

describe("ordbogen sendes IKKE når sitet ikke har en", () => {
  it("sitetsUdtaler svarer undefined og ikke en tom liste", () => {
    // Forskellen er ikke kosmetisk: `...(x ? {pronunciations: x} : {})` sender
    // feltet på en tom liste, og et site der ikke har taget stilling skal
    // sende ingenting (ship-dark).
    const k = KODE("udtale.ts");
    expect(k).toContain("return brugbare.length ? brugbare : undefined;");
  });
});

describe("MOTOREN EJER INGEN ORD (F189.3-grænsen)", () => {
  const filer = ["udtale.ts", "record.ts", "bumper.ts", "sponsors.ts", "preflight.ts"];

  it("ingen site-specifikke ord står i motoren", () => {
    // Christians to ord fra 8/9 er dem der ville have været fristende at
    // hardkode. Ordbogen hører til sitet — en CMS-evne flere kunder køber sig
    // ind på, må ikke eje ét sites udtale.
    for (const f of filer) {
      const kode = KODE(f)
        // Kommentarerne FORKLARER grænsen og nævner derfor ordene. Det er
        // koden der ikke må indeholde dem.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      expect(kode.toLowerCase(), `${f} nævner et site-ord`).not.toContain("broberg");
      expect(kode.toLowerCase(), `${f} nævner et site-ord`).not.toContain("plugins");
    }
  });

  it("ordbogen læses fra site-konfigurationen", () => {
    expect(KODE("udtale.ts")).toContain('readSiteConfig');
    expect(KODE("udtale.ts")).toContain("cfg.podcastUdtaler");
  });
});

describe("begge stemmer får den — ikke kun reklamens", () => {
  it("Aidans overgangsreplik sender pronunciations", () => {
    // Aidan siger sponsorens navn i sin egen indledning. En ordbog der kun nåede
    // reklamen ville give to udtaler af samme navn med fem sekunders mellemrum.
    const k = KODE("record.ts");
    expect(k).toContain("const udtaler = await sitetsUdtaler();");
    expect(k).toContain("...(udtaler ? { pronunciations: udtaler } : {}),");
  });

  it("sponsorens indtaling sender pronunciations", () => {
    const rute = readFileSync(
      new URL("../../app/api/podcast/sponsor/[slug]/generate/route.ts", import.meta.url),
      "utf8",
    );
    expect(rute).toContain("const pronunciations = await sitetsUdtaler();");
    expect(rute).toContain("...(pronunciations ? { pronunciations } : {}),");
  });

  it("KONTROL: begge steder kalder det SAMME opslag", () => {
    // To kilder til én ordbog er husets klassiske fælde — den er ikke gal den
    // dag den skrives, men den dag den ene bliver rettet.
    expect(KODE("record.ts")).toContain('from "./udtale"');
    const rute = readFileSync(
      new URL("../../app/api/podcast/sponsor/[slug]/generate/route.ts", import.meta.url),
      "utf8",
    );
    expect(rute).toContain('from "@/lib/podcast/udtale"');
  });
});
