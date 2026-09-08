/**
 * F189.6 — vagterne om de fire skærme.
 *
 * Tre af kortets acceptkriterier er egenskaber ved KILDEN, ikke ved en enkelt
 * kørsel: at UI\'et kun taler med API\'et, at «Indspil» er slukket indtil der er
 * godkendt, og at bekræftelsen ikke er en browser-dialog. En Lens-kørsel viser
 * hvordan det SER ud i dag; disse prøver holder fast i hvorfor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
/** F191.8: skærmene blev til FANER, så de tre klient-flader flyttede ud i
 *  components/podcast/. Vagten følger med — den handler om podcast-UI'et, ikke
 *  om en bestemt mappe. Havde den kun kigget i rute-mappen, ville den efter
 *  flytningen have målt to redirect-filer og en skal, og bestået på ingenting. */
const UI_DIRS = [
  join(PKG_ROOT, "src/app/admin/(workspace)/podcast"),
  join(PKG_ROOT, "src/components/podcast"),
];
const UI_LOSE = [join(PKG_ROOT, "src/components/podcast-tabs.tsx")];

function tsxFiler(dir: string): string[] {
  const ud: string[] = [];
  for (const navn of readdirSync(dir)) {
    const sti = join(dir, navn);
    if (statSync(sti).isDirectory()) ud.push(...tsxFiler(sti));
    else if (navn.endsWith(".tsx")) ud.push(sti);
  }
  return ud;
}

/** Kommentarer væk FØRST. Filerne forklarer hvorfor de ikke gør de forbudte
 *  ting, og uden strip ville netop den forklaring gøre prøven rød. */
const udenKommentarer = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const FILER = [...UI_DIRS.flatMap(tsxFiler), ...UI_LOSE].map((f) => ({
  kort: relative(PKG_ROOT, f),
  kilde: udenKommentarer(readFileSync(f, "utf8")),
  raa: readFileSync(f, "utf8"),
}));

describe("F189.6 — skærmene er KLIENTER af API'et", () => {
  it("finder skærmene (ellers måler resten ingenting)", () => {
    expect(FILER.length).toBeGreaterThanOrEqual(5);
  });

  for (const f of FILER) {
    it(`${f.kort} importerer ikke motoren direkte`, () => {
      // Kunne cms-admin gå uden om /api/podcast/*, ville der være to veje ind
      // i motoren hvoraf kun den ene er prøvet — og site-panelet ude i kundens
      // eget site ville få den utestede.
      expect(f.kilde).not.toMatch(/from\s+["']@\/lib\/podcast/);
    });
  }

  it("alle netværkskald går til /api/podcast/", () => {
    const klient = FILER.filter((f) => f.raa.startsWith('"use client"'));
    expect(klient.length).toBeGreaterThanOrEqual(2);
    let i_alt = 0;
    for (const f of klient) {
      const kald = [...f.kilde.matchAll(/fetch\(\s*[`"']([^`"'$]*)/g)].map((m) => m[1]!);
      i_alt += kald.length;
      for (const u of kald) expect(u, `${f.kort} kalder ${u}`).toMatch(/^\/api\/podcast/);
    }
    // Kravet er at INTET kald går andre steder hen — ikke at hver enkelt fil
    // kalder noget. Fane-skallen har med rette ingen fetch. Optællingen står
    // samlet, så løkken ikke kan bestå på en tom liste.
    expect(i_alt, "ingen af skærmene kalder API'et — vagten måler på ingenting").toBeGreaterThan(5);
  });
});

describe("F189.6 — pengeknappen", () => {
  const detalje = FILER.find((f) => f.kort.includes("[slug]"))!;

  it("«Indspil» er slukket indtil manuskriptet er godkendt", () => {
    // disabled skal afhænge af godkendelsen — ikke bare af at noget arbejder.
    expect(detalje.kilde).toMatch(/data-testid="podcast-indspil"[\s\S]{0,240}disabled=\{![\s\S]{0,40}godkendt/);
  });

  it("godkendt udledes af tilstanden «godkendt», ikke af noget andet", () => {
    expect(detalje.kilde).toMatch(/const godkendt = tilstand === "godkendt"/);
  });

  // BELØBET, ikke et bestemt feltnavn. Vagten pinnede «prisUsd» og blev rød da
  // priserne blev lagt om til kroner (Christian 8/9: «Omregn til DKK») — den
  // målte implementeringen i stedet for kravet, som er at man kan se hvad et
  // tryk koster UDEN at flytte blikket. Nu accepteres begge valutaer.
  const BELOEB = /pris(Usd|Dkk)/;

  it("prisen står PÅ knappen, ikke kun i en note ved siden af", () => {
    const iKnap = detalje.kilde.match(/data-testid="podcast-indspil"[\s\S]{0,400}?<\/button>/);
    expect(iKnap, "indspil-knappen blev ikke fundet").toBeTruthy();
    expect(iKnap![0]).toMatch(BELOEB);
  });

  it("bekræftelsens JA-knap bærer også beløbet", () => {
    const ja = detalje.kilde.match(/data-testid="podcast-bekraeft-ja"[\s\S]{0,900}?<\/button>/);
    expect(ja, "ja-knappen blev ikke fundet").toBeTruthy();
    expect(ja![0]).toMatch(BELOEB);
  });
});

describe("F189.6 — husets mønster, ikke browserens", () => {
  for (const f of FILER) {
    it(`${f.kort} bruger ingen native dialog`, () => {
      expect(f.kilde).not.toMatch(/\b(window\.)?(confirm|alert|prompt)\s*\(/);
    });
    it(`${f.kort} bruger ingen native <select>`, () => {
      expect(f.kilde).not.toMatch(/<select[\s>]/);
    });
  }

  it("bekræftelsen har både Ja og Nej", () => {
    const d = FILER.find((f) => f.kort.includes("[slug]"))!.kilde;
    expect(d).toContain('data-testid="podcast-bekraeft-ja"');
    expect(d).toContain('data-testid="podcast-bekraeft-nej"');
  });
});

describe("F189.6 — hvert interaktivt element har et data-testid", () => {
  /**
   * Finder en JSX-tags ÆGTE slutning ved at tælle klammer.
   *
   * Første udgave brugte /<button\\b([^>]*)>/ og meldte seks elementer der ALLE
   * havde et testid: `>`-tegnet i en pilefunktion (`onClick={() =>`) afsluttede
   * "taggen" for tidligt, så attributterne bagefter aldrig blev set. En vagt
   * med falske positiver er værre end ingen — den lærer læseren at ignorere den.
   */
  function tags(kilde: string, navn: string): string[] {
    const ud: string[] = [];
    const re = new RegExp(`<${navn}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(kilde))) {
      let i = m.index + m[0].length;
      let dybde = 0;
      for (; i < kilde.length; i++) {
        const c = kilde[i]!;
        if (c === "{") dybde++;
        else if (c === "}") dybde--;
        else if (c === ">" && dybde === 0) break;
      }
      ud.push(kilde.slice(m.index, i + 1));
    }
    return ud;
  }

  const alleFiler = FILER.map((f) => ({
    ...f,
    elementer: ["button", "input", "textarea", "audio"].flatMap((n) => tags(f.kilde, n)),
  }));

  it("finder overhovedet interaktive elementer (ellers består vagten på nul)", () => {
    // Spærren hører til her og ikke pr. fil: layout.tsx er en ren server-gate
    // uden ét eneste element, og et krav pr. fil ville gøre den rød for at
    // gøre præcis dét den skal.
    const i_alt = alleFiler.reduce((n, f) => n + f.elementer.length, 0);
    expect(i_alt).toBeGreaterThanOrEqual(10);
  });

  for (const f of alleFiler) {
    it(`${f.kort}`, () => {
      const uden = f.elementer.filter((t) => !t.includes("data-testid")).map((t) => t.slice(0, 70));
      expect(uden, `uden testid: ${uden.join(" | ")}`).toHaveLength(0);
    });
  }
});
