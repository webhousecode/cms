/**
 * F190.1 — vagten mod det NÆSTE tabte felt i AI-indstillingerne.
 *
 * Dagens fejl var at `mistralApiKey` manglede i POST-rutens output-objekt, så
 * hver gemning skrev config uden den. Den ene linje der retter det er ikke det
 * interessante — formen er: ruten genopbygger config fra en HÅNDSKREVET
 * feltliste, og et felt uden for listen forsvinder tavst.
 *
 * Huset har allerede en hård regel om præcis den mekanik (config-writeren der
 * tabte `locales` på hver skema-redigering). At reglen fandtes og fejlen
 * alligevel opstod, siger at en liste man skal HUSKE at opdatere ér hullet.
 *
 * Så denne prøve husker i stedet: den læser felterne i AiConfig-typen og
 * kræver at hvert af dem enten skrives af ruten eller står på en EKSPLICIT
 * udeladelsesliste. At udelade et felt bliver dermed en synlig handling.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// src/lib/__tests__ → ../../.. er pakkeroden.
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const TYPE_FIL = join(PKG_ROOT, "src/lib/ai-config.ts");
const RUTE_FIL = join(PKG_ROOT, "src/app/api/admin/ai-config/route.ts");

/**
 * Felter der med VILJE ikke skrives af ruten. Hvert af dem skal have en grund
 * her — det er forskellen på en udeladelse og en forglemmelse.
 */
const BEVIDST_UDELADT = new Set([
  // Erstattet af braveApiKey/tavilyApiKey. Skrives ikke længere; markeret
  // @deprecated i typen.
  "webSearchApiKey",
]);

/** Felterne i `interface AiConfig { … }`, læst fra kilden. */
function typensFelter(): string[] {
  const kilde = readFileSync(TYPE_FIL, "utf8");
  const start = kilde.indexOf("export interface AiConfig {");
  expect(start).toBeGreaterThan(-1);
  const slut = kilde.indexOf("}", start);
  const krop = kilde.slice(start, slut);
  return [...krop.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]!);
}

/** Nøglerne i rutens `const updated: AiConfig = { … }`. */
function rutensFelter(): string[] {
  const kilde = readFileSync(RUTE_FIL, "utf8");
  const start = kilde.indexOf("const updated: AiConfig = {");
  expect(start).toBeGreaterThan(-1);
  const slut = kilde.indexOf("};", start);
  const krop = kilde.slice(start, slut);
  // Kun rigtige nøgler — kommentarlinjer først væk, ellers tæller en
  // kommentar der nævner et feltnavn som om feltet blev skrevet. (Samme
  // fælde kostede en falsk negativ kontrol 6/9: en assertion målte min egen
  // kommentar i stedet for koden.)
  const uden = krop.replace(/\/\/[^\n]*/g, "");
  return [...uden.matchAll(/^\s{6}(\w+):/gm)].map((m) => m[1]!);
}

describe("F190.1 — AI-config-rutens feltdækning", () => {
  const typen = typensFelter();
  const ruten = rutensFelter();

  it("kan læse begge feltlister (ellers måler resten ingenting)", () => {
    expect(typen.length).toBeGreaterThanOrEqual(7);
    expect(ruten.length).toBeGreaterThanOrEqual(6);
  });

  it("skriver mistralApiKey — feltet der blev tabt", () => {
    expect(ruten).toContain("mistralApiKey");
  });

  for (const felt of typensFelter()) {
    if (BEVIDST_UDELADT.has(felt)) continue;
    it(`skriver «${felt}» (ellers tabes det ved hver gemning)`, () => {
      expect(ruten).toContain(felt);
    });
  }

  it("udeladelseslisten indeholder kun felter der FINDES i typen", () => {
    // En forældet post på listen ville stiltiende undtage et felt der ikke
    // længere hedder det samme — og så er vagten slået fra for et felt ingen
    // ved af.
    for (const felt of BEVIDST_UDELADT) expect(typen).toContain(felt);
  });
});
