/**
 * Accentfarven bruges to steder med hver sit krav: som FLADE (knap-baggrund,
 * kantlinje) og som TEKST (etiket, links, fodnote). Den samme farve kan klare
 * det ene og dumpe det andet.
 *
 * Målt 5/9-2026 af Lens' kontrast-kritiker på en rigtig formular-notifikation
 * med WebHouse-guld: «Ny henvendelse» 1,73:1 · «Åbn i CMS» 1,73:1 ·
 * «webhouse.dk» 1,58:1. Kravet er 4,5:1. Fejlen var usynlig fordi husets
 * STANDARD-accent (#e4203a) klarer den — den ramte først et site med et lyst
 * brand, og en mail ingen af os læser efter.
 */
import { describe, it, expect } from "vitest";
import { laesbarSomTekst, brandForSite, WEBHOUSE } from "../mail/brand";

function kanal(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
/** Uafhængig genudregning — testen stoler ikke på kildens egen hjælper. */
function kontrastModFlade(hex: string): number {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  const L = 0.2126 * kanal(r!) + 0.7152 * kanal(g!) + 0.0722 * kanal(b!);
  const flade = 0.2126 * kanal(0xf4) + 0.7152 * kanal(0xf4) + 0.0722 * kanal(0xf5);
  return (flade + 0.05) / (L + 0.05);
}

describe("laesbarSomTekst", () => {
  it("WebHouse-guld var 1,73:1 og klarer nu kravet", () => {
    expect(kontrastModFlade("#F7BB2E")).toBeLessThan(2);
    expect(kontrastModFlade(laesbarSomTekst("#F7BB2E"))).toBeGreaterThanOrEqual(4.5);
  });

  it("en farve der ALLEREDE klarer kravet røres ikke", () => {
    // Negativ kontrol: uden den ville hvert mørkt brand blive unødigt mørkere.
    // #1f4e8c er mørk nok i forvejen — modsat husets egen røde, der lige akkurat
    // dumper mod fodnotens grå og derfor SKAL justeres.
    expect(kontrastModFlade("#1f4e8c")).toBeGreaterThanOrEqual(4.5);
    expect(laesbarSomTekst("#1f4e8c")).toBe("#1f4e8c");
  });

  it("husets egen røde klarer hvid, men ikke fodnotens grå — og justeres derfor", () => {
    // Den målte grund til at målet flyttede fra hvid til #f4f4f5.
    expect(laesbarSomTekst("#e4203a")).not.toBe("#e4203a");
    expect(kontrastModFlade(laesbarSomTekst("#e4203a"))).toBeGreaterThanOrEqual(4.5);
  });

  it("virker for enhver lys kulør, ikke kun guld", () => {
    for (const lys of ["#ffe100", "#7fffd4", "#ff9ecd", "#a0e8ff", "#c8ff00"]) {
      expect(kontrastModFlade(laesbarSomTekst(lys))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("et ugyldigt hex returneres uændret frem for at blive til sort", () => {
    expect(laesbarSomTekst("rgb(1,2,3)")).toBe("rgb(1,2,3)");
  });
});

describe("brandForSite", () => {
  it("FLADEN beholder sitets rene brandfarve; kun TEKSTEN mørknes", () => {
    const b = brandForSite({ emailAccentColor: "#F7BB2E" } as never);
    expect(b.accentColor).toBe("#F7BB2E");
    expect(b.accentText).not.toBe("#F7BB2E");
    expect(kontrastModFlade(b.accentText)).toBeGreaterThanOrEqual(4.5);
  });

  it("standard-brandet bærer også feltet", () => {
    expect(kontrastModFlade(WEBHOUSE.accentText)).toBeGreaterThanOrEqual(4.5);
  });
});
