/**
 * F189.6 — nummer + sæson, og den manuelle oprettelse.
 *
 * Ejeren 8/9-2026: «trods at vi tager udgangspunkt i sitets artikler så SKAL
 * man altså også kunne oprette et manuskript manuelt og bestemme hvor i
 * sæsonen det skal placeres» — og «24 afsnit om året som udgangspunkt».
 *
 * Det andet tal er grunden til at SÆSON findes ved siden af nummeret: løber
 * tælleren 1-24 og starter forfra, ville en sortering på nummer alene sætte
 * sæson 1\'s afsnit 24 over sæson 2\'s afsnit 1.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { _laesData } from "../podcast/store";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const RUTE = readFileSync(join(PKG_ROOT, "src/app/api/podcast/route.ts"), "utf8");
const STORE = readFileSync(join(PKG_ROOT, "src/lib/podcast/store.ts"), "utf8");

describe("laesData — nummer og sæson læses defensivt", () => {
  it("tager tallene med når de er tal", () => {
    const d = _laesData({ nummer: 7, saeson: 2 });
    expect(d.nummer).toBe(7);
    expect(d.saeson).toBe(2);
  });

  it("NUL er et gyldigt nummer", () => {
    // Den oplagte `d.nummer || undefined` ville kaste 0 væk i stilhed. Præcis
    // den fælde kostede fd-sundhed et kundenummer.
    expect(_laesData({ nummer: 0 }).nummer).toBe(0);
  });

  it("en streng er ikke et nummer", () => {
    expect(_laesData({ nummer: "7", saeson: "2" }).nummer).toBeUndefined();
    expect(_laesData({ nummer: "7", saeson: "2" }).saeson).toBeUndefined();
  });

  it("NaN og Infinity afvises", () => {
    expect(_laesData({ nummer: NaN }).nummer).toBeUndefined();
    expect(_laesData({ saeson: Infinity }).saeson).toBeUndefined();
  });

  it("felterne UDELADES helt frem for at stå som undefined", () => {
    expect("nummer" in _laesData({})).toBe(false);
    expect("saeson" in _laesData({})).toBe(false);
  });
});

describe("opretAfsnit — den manuelle vej ind", () => {
  it("findes, så et afsnit kan laves UDEN en artikel", () => {
    expect(STORE).toContain("export async function opretAfsnit");
  });

  it("afviser hvis afsnittet findes i forvejen", () => {
    // Et «opret» der stiltiende overskriver et manuskript nogen har skrevet,
    // er ikke et opret.
    expect(STORE).toMatch(/if \(findes\) \{[\s\S]{0,140}findes allerede/);
  });

  it("starter i «kladde» med tomt manuskript", () => {
    const krop = STORE.slice(STORE.indexOf("export async function opretAfsnit"));
    expect(krop).toMatch(/tilstand: "kladde"/);
    expect(krop).toMatch(/replikker: \[\]/);
  });
});

describe("POST /api/podcast — validering", () => {
  it("kræver podcast.edit, ikke podcast.read", () => {
    const post = RUTE.slice(RUTE.indexOf("export async function POST"));
    expect(post).toContain("PODCAST_PERMISSIONS.edit");
  });

  it("afviser en slug der ikke kan bære et filnavn og en URL", () => {
    const re = /\/\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$\//;
    expect(RUTE).toMatch(re);
  });

  it("tom streng, null og undefined bliver til «intet tal» — ikke til 0", () => {
    // Number("") === 0. Uden den eksplicitte gren ville et tomt felt i formen
    // give afsnit nummer 0 i stedet for et unummereret afsnit.
    expect(RUTE).toMatch(/v === undefined \|\| v === null \|\| v === ""/);
  });
});

describe("listen sorteres af SERVEREN", () => {
  it("sæson først, så nummer — begge faldende", () => {
    expect(RUTE).toMatch(/saeson \?\? -1[\s\S]{0,60}nummer \?\? -1/);
  });

  it("unummererede sidst, ikke forrest", () => {
    // `?? -1` og ikke `?? 0`: et afsnit uden nummer er en kladde, ikke det
    // nyeste. Med 0 ville en kladde ligge over afsnit nummer 0.
    expect(RUTE).not.toMatch(/nummer \?\? 0/);
    expect(RUTE).toMatch(/nummer \?\? -1/);
  });

  it("rækkefølgen ligger i svaret, så hver klient ikke skal finde på sin egen", () => {
    expect(RUTE).toMatch(/svar\(req, \{ afsnit: sorteret \}\)/);
  });
});
