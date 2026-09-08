/**
 * F189.6.1 — hvert menupunkt i sidebaren er sit EGET punkt.
 *
 * Christian, 8/9, med et skærmbillede: «Hvad er der sket med det almindelige
 * Forms modul i cms? Hvor er det selvstændige Podcast modul?» De to stod på
 * samme række.
 *
 * Årsagen var min egen: Podcast-blokken blev lagt INDE i Forms-knappen, før
 * dens lukkende tag. Så delte de række, og Podcast var et <a> inde i et <a>.
 * Browseren gjorde ingen indsigelse, JSX'en var gyldig, typecheck var grøn —
 * kun øjet kunne se det.
 *
 * Derfor måler prøven STRUKTUREN og ikke udseendet: hvert menupunkt skal have
 * lige så mange åbne som lukkede tags, og et menupunkt må ikke ligge inde i et
 * andet. Det er den regel der er brudt, uanset hvilket punkt det næste gang
 * rammer.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const KILDE = readFileSync(new URL("../../components/sidebar.tsx", import.meta.url), "utf8");

/** Kildeteksten uden kommentarer — filen FORKLARER fejlen, og forklaringen
 *  indeholder både «<a>» og «SidebarMenuItem», som ellers ville tælle med. */
const KODE = KILDE.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("sidebarens menupunkter er søskende, ikke børn", () => {
  it("kilden findes og har menupunkter (ellers måler resten ingenting)", () => {
    expect(KODE).toContain("<SidebarMenuItem>");
    expect((KODE.match(/<SidebarMenuItem>/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("hvert <SidebarMenuItem> er lukket — lige mange åbne og lukkede", () => {
    const aabne = (KODE.match(/<SidebarMenuItem[\s>]/g) ?? []).length;
    const lukkede = (KODE.match(/<\/SidebarMenuItem>/g) ?? []).length;
    expect(aabne, `${aabne} åbne mod ${lukkede} lukkede`).toBe(lukkede);
  });

  it("INTET menupunkt ligger inde i et andet — det var præcis fejlen", () => {
    // Går teksten igennem og tæller dybden. Møder vi et <SidebarMenuItem> mens
    // vi allerede står i et, er der et punkt inde i et punkt.
    const poletter = [...KODE.matchAll(/<(\/?)SidebarMenuItem[\s>]/g)];
    let dybde = 0;
    let vaerste = 0;
    for (const p of poletter) {
      if (p[1] === "/") dybde--;
      else dybde++;
      vaerste = Math.max(vaerste, dybde);
    }
    expect(vaerste, "et menupunkt ligger inde i et andet").toBe(1);
    expect(dybde, "et menupunkt blev aldrig lukket").toBe(0);
  });

  it("INGEN menuknap ligger inde i en anden — et <a> inde i et <a>", () => {
    const poletter = [...KODE.matchAll(/<(\/?)SidebarMenuButton[\s>]/g)];
    let dybde = 0;
    let vaerste = 0;
    for (const p of poletter) {
      if (p[1] === "/") dybde--;
      else dybde++;
      vaerste = Math.max(vaerste, dybde);
    }
    expect(vaerste, "en menuknap ligger inde i en anden").toBe(1);
  });

  it("Forms og Podcast er to SELVSTÆNDIGE punkter", () => {
    // Den konkrete melding, holdt fast ved siden af den generelle regel: en
    // regel om dybde ville også være grøn hvis Podcast-punktet forsvandt helt.
    expect(KODE).toContain('data-testid="nav-link-forms"');
    expect(KODE).toContain('data-testid="nav-link-podcast"');
    const forms = KODE.indexOf('data-testid="nav-link-forms"');
    const podcast = KODE.indexOf('data-testid="nav-link-podcast"');
    const mellem = KODE.slice(forms, podcast);
    // Mellem de to skal Forms' eget punkt være LUKKET.
    expect(mellem, "Forms-punktet lukkes ikke før Podcast begynder").toContain(
      "</SidebarMenuItem>",
    );
  });
});
