/**
 * F189.4 — indspilningen, den ene handling der koster rigtige penge.
 *
 * Nøglen prøves direkte; rækkefølgen på kilden. `indspil()` kræver et CMS, en
 * medie-adapter og en betalende AI-udbyder — en prøve der mocker alle tre ville
 * bevise mocken, og den ene af dem koster penge hver gang den kaldes rigtigt.
 * Runtime-beviset er F189.7.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lydNoegle } from "../podcast/record";
import type { Replik } from "../podcast/manuscript";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const kilde = fs.readFileSync(path.join(PKG_ROOT, "src/lib/podcast/record.ts"), "utf-8");

const m: Replik[] = [
  { speaker: "aidan", text: "en" },
  { speaker: "airina", text: "to" },
];
const stemmer = { aidan: "soren", airina: "camilla" };

describe("lydNoegle — lydens identitet", () => {
  it("samme manuskript + samme stemmer giver SAMME nøgle", () => {
    expect(lydNoegle(m, stemmer)).toBe(lydNoegle([...m], { ...stemmer }));
  });

  it("en ÆNDRET replik giver en anden nøgle", () => {
    const rettet: Replik[] = [{ speaker: "aidan", text: "en rettet" }, m[1]!];
    expect(lydNoegle(rettet, stemmer)).not.toBe(lydNoegle(m, stemmer));
  });

  it("ANDRE STEMMER giver en anden nøgle — samme tekst, anden lydfil", () => {
    // Uden stemmerne i nøglen ville en stemmeændring genbruge den gamle
    // optagelse: filen findes, afspilleren virker, og der er ingen fejl at se.
    expect(lydNoegle(m, { aidan: "jesper", airina: "camilla" })).not.toBe(lydNoegle(m, stemmer));
  });

  it("rækkefølgen tæller — to byttede replikker er et andet afsnit", () => {
    expect(lydNoegle([m[1]!, m[0]!], stemmer)).not.toBe(lydNoegle(m, stemmer));
  });

  it("TALEREN tæller — samme ord sagt af den anden vært er en anden samtale", () => {
    const byttet: Replik[] = [
      { speaker: "airina", text: "en" },
      { speaker: "aidan", text: "to" },
    ];
    expect(lydNoegle(byttet, stemmer)).not.toBe(lydNoegle(m, stemmer));
  });

  it("nøglen er kort nok til et filnavn", () => {
    expect(lydNoegle(m, stemmer)).toHaveLength(16);
    expect(lydNoegle(m, stemmer)).toMatch(/^[0-9a-f]+$/);
  });
});

describe("rækkefølgen — pengene må ikke bruges før spærren er passeret", () => {
  it("maaIndspilles kaldes FØR ai.podcast", () => {
    const spaerre = kilde.indexOf("maaIndspilles(afsnit.data.tilstand)");
    const studie = kilde.indexOf("ai.podcast(");
    expect(spaerre).toBeGreaterThan(-1);
    expect(studie).toBeGreaterThan(-1);
    expect(spaerre).toBeLessThan(studie);
  });

  it("spærren RETURNERER — den logger ikke bare og fortsætter", () => {
    expect(kilde).toMatch(/if \(!maa\.ok\) return \{ ok: false, grund: maa\.grund \}/);
  });

  it("tilstanden sættes til «indspillet» EFTER at filen er gemt", () => {
    const gemt = kilde.indexOf("adapter.uploadFile(");
    const tilstand = kilde.indexOf('tilstand: "indspillet"');
    expect(gemt).toBeGreaterThan(-1);
    expect(tilstand).toBeGreaterThan(-1);
    // «Indspillet» med en manglende fil ser færdigt ud og kan ikke afspilles.
    expect(gemt).toBeLessThan(tilstand);
  });

  it("en fejl i studiet efterlader afsnittet URØRT", () => {
    const foer = kilde.slice(0, kilde.indexOf("ai.podcast("));
    // Ingen skrivning før studiet — ellers ville en fejl efterlade en halv
    // tilstand.
    expect(foer).not.toContain("skrivAfsnit(");
  });

  it("en gemme-fejl siger EKSPLICIT at pengene er brugt", () => {
    // Den der læser beskeden skal vide at et nyt forsøg koster igen.
    expect(kilde).toMatch(/lavet \(og betalt\)/);
    expect(kilde).toMatch(/det koster igen/);
  });

  it("samme nøgle genbruger filen frem for at betale igen", () => {
    expect(kilde).toMatch(/afsnit\.data\.lydNoegle === noegle/);
  });

  it("filnavnet bærer nøglen — en rettelse overskriver ikke en fil i brug", () => {
    expect(kilde).toMatch(/podcast-\$\{args\.afsnitSlug\}-\$\{noegle\}\.mp3/);
  });

  it("lyden laves gennem @broberg/ai-sdk, ikke en rå udbyder", () => {
    expect(kilde).toContain("getAI()");
    expect(kilde).toContain('purpose: "podcast.episode"');
    expect(kilde).not.toMatch(/elevenlabs\.(com|io)|api\.elevenlabs/);
  });

  it("adapterens url bruges UÆNDRET — ingen /uploads foran", () => {
    // Den fejl der faktisk skete: `/uploads${resultat.url}` gav
    // «/uploads/uploads/...», som svarer 404. Filen fandtes, prisen var gemt,
    // tilstanden var «indspillet» — og feltet en lytter skal bruge, pegede
    // på ingenting. Alt så grønt ud.
    expect(kilde).toContain("lydUrl = resultat.url;");
    expect(kilde).not.toMatch(/`\/uploads\$\{/);
  });

  it("media-adapteren returnerer selv en /uploads-sti (kontrakten der gjorde præfikset forkert)", () => {
    // Måler den ANDEN halvdel: at antagelsen bag rettelsen holder. Ændrer
    // filesystem-adapteren sin url-form, skal DENNE prøve fejle — ikke en
    // lytters afspiller.
    const adapterKilde = fs.readFileSync(
      path.join(PKG_ROOT, "src/lib/media/filesystem.ts"),
      "utf-8",
    );
    // HVER url-tildeling skal bruge /uploads, ikke bare én af dem. Første
    // udgave af denne prøve spurgte «findes der ét sted med /uploads?» — og
    // filen har TRE, så en mutation af den ene blev grøn. Mutations-tjekket
    // fangede det; den svagere prøve ville have set ud som dækning.
    const tildelinger = [...adapterKilde.matchAll(/const urlPath = [^;]+;/g)].map((m) => m[0]);
    expect(tildelinger.length).toBeGreaterThanOrEqual(3);
    for (const t of tildelinger) expect(t).toContain("/uploads/");
  });

  it("den FAKTISKE pris gemmes på afsnittet", () => {
    // «Hvad kostede det» skal kunne besvares bagefter, ikke kun estimeres.
    expect(kilde).toMatch(/faktiskPrisUsd: pris/);
  });
});
