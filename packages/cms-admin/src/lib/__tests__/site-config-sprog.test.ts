/**
 * F193.2 — sitets EGET sprog må ikke kunne overdøves af en standardværdi.
 *
 * `site-config.ts` satte `defaultLocale: "en"` som standard. Den er ALTID en
 * sandhedsværdi, og 20 kaldesteder skriver
 *
 *     siteConfig.defaultLocale || config.defaultLocale
 *
 * så venstresiden vandt hver gang. Et site der erklærede `defaultLocale: "da"`
 * i sin egen cms.config fik "en" overalt i admin — indtil et menneske
 * tilfældigvis åbnede Indstillinger og gemte.
 *
 * Ikke kosmetisk: AI-oversættelse, SEO-optimering, brand-voice og
 * agent-prompts bygger deres sprog-instruktion på præcis den værdi. Et dansk
 * site fik besked om at skrive engelsk.
 *
 * Denne prøve måler MØNSTRET frem for at køre readSiteConfig() (som kræver en
 * hel site-kontekst): standarden må ikke længere være en hårdkodet streng, og
 * den skal komme fra sitets egen konfiguration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const KILDE = readFileSync(fileURLToPath(new URL("../site-config.ts", import.meta.url)), "utf8");
const UDEN_KOMMENTAR = KILDE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("standard-sproget kommer fra sitet, ikke fra en gætteværdi", () => {
  it("der står ikke længere en hårdkodet defaultLocale i standarderne", () => {
    // Præcis den linje der gjorde sitets eget valg uopnåeligt.
    expect(UDEN_KOMMENTAR).not.toMatch(/defaultLocale:\s*"en"/);
  });

  it("standarderne læser sitets egen cms.config", () => {
    expect(UDEN_KOMMENTAR).toMatch(/getAdminConfig/);
    expect(UDEN_KOMMENTAR).toMatch(/cfg\?\.defaultLocale|cfg\.defaultLocale/);
  });

  it("opslaget fejler LUKKET til det gamle «en» frem for at vælte site-config", () => {
    // Et site uden konfiguration må ikke gøre readSiteConfig() til en fejl.
    expect(UDEN_KOMMENTAR).toMatch(/let defaultLocale = "en"/);
    expect(UDEN_KOMMENTAR).toMatch(/getAdminConfig[\s\S]{0,400}?catch/);
  });

  it("KONTROL: prøven læser den rigtige fil og den har indhold", () => {
    // Uden denne består de tre ovenfor på en tom eller forkert fil.
    expect(KILDE.length).toBeGreaterThan(5000);
    expect(KILDE).toMatch(/export async function readSiteConfig/);
  });
});
