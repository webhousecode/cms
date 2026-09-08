/**
 * F157.19 — paletten. Christian meldte to ting i samme sætning: at farven ikke
 * blev sat, og at paletten manglede standardfarver + sitets egne.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  STANDARD_FARVER,
  erFarve,
  variabelNavne,
  siteFarver,
  pentNavn,
  testidNavn,
} from "./site-colors.js";

const INDEX = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
/** Kommentarer væk: filen FORKLARER hvorfor den ikke bruger en native dialog,
 *  og uden strip ville netop den forklaring gøre prøven rød. */
const KODE = INDEX.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** Et minimalt CSSStyleSheet-stand-in — nok til det variabelNavne læser. */
function ark(selector: string, props: string[]): CSSStyleSheet {
  const style = Object.assign(Object.create(null), { length: props.length }) as Record<string, unknown>;
  props.forEach((p, i) => (style[String(i)] = p));
  return { cssRules: [{ selectorText: selector, style }] } as unknown as CSSStyleSheet;
}

describe("erFarve — kun det der ER en farve", () => {
  it("tager hex, rgb og hsl", () => {
    for (const v of ["#fff", "#d2644e", "#d2644eff", "rgb(1,2,3)", "rgba(1,2,3,.5)", "hsl(20 50% 40%)"])
      expect(erFarve(v), v).toBe(true);
  });

  it("afviser alt andet — en variabel er ikke en farve fordi den hedder --primary", () => {
    // --primary-spacing: 1.5rem må ALDRIG ende i en farvepalet.
    for (const v of ["1.5rem", "", "  ", "sans-serif", "var(--x)", "0", "12px"])
      expect(erFarve(v), JSON.stringify(v)).toBe(false);
  });
});

describe("variabelNavne — hvor farverne står", () => {
  it("finder custom properties på :root og html", () => {
    expect(variabelNavne([ark(":root", ["--brand", "--ink"])])).toEqual(["--brand", "--ink"]);
    expect(variabelNavne([ark("html", ["--a"])])).toEqual(["--a"]);
    expect(variabelNavne([ark(":root, [data-theme]", ["--b"])])).toEqual(["--b"]);
  });

  it("springer regler over der ikke er :root/html", () => {
    expect(variabelNavne([ark(".kort", ["--lokal"])])).toEqual([]);
  });

  it("springer ikke-variabler over", () => {
    expect(variabelNavne([ark(":root", ["color", "--rigtig"])])).toEqual(["--rigtig"]);
  });

  it("ET CROSS-ORIGIN ARK KOSTER IKKE HELE PALETTEN", () => {
    // .cssRules kaster på et fremmed ark (et Google Fonts-link er nok). Uden
    // try/catch ville ét sådant ark tømme paletten, og fejlen ville se ud som
    // «sitet har ingen farver».
    const fremmed = {
      get cssRules(): CSSRuleList {
        throw new Error("SecurityError");
      },
    } as unknown as CSSStyleSheet;
    expect(variabelNavne([fremmed, ark(":root", ["--vores"])])).toEqual(["--vores"]);
  });
});

describe("siteFarver", () => {
  const a = [ark(":root", ["--brand", "--ink", "--gap", "--paper"])];
  const vaerdier: Record<string, string> = {
    "--brand": "#d2644e",
    "--ink": "rgb(30,36,45)",
    "--gap": "1.5rem",
    "--paper": "#ffffff",
  };
  const laes = (n: string) => vaerdier[n] ?? "";

  it("tager farverne og springer det der ikke er en farve over", () => {
    const f = siteFarver(a, laes);
    expect(f.map((x) => x.vaerdi)).toEqual(["#d2644e", "rgb(30,36,45)"]);
  });

  it("gentager ikke en farve der allerede står som standard", () => {
    // --paper er #ffffff, som er standardpalettens Hvid. To ens felter ved
    // siden af hinanden ligner en fejl.
    expect(siteFarver(a, laes).some((x) => x.vaerdi.toLowerCase() === "#ffffff")).toBe(false);
  });

  it("bærer et læsbart navn", () => {
    expect(siteFarver(a, laes)[0]!.navn).toBe("brand");
    expect(pentNavn("--brand-primary-2")).toBe("brand primary 2");
  });

  it("klipper listen — en palet med fyrre felter er en liste, ikke en palet", () => {
    const mange = Array.from({ length: 40 }, (_, i) => `--c${i}`);
    const f = siteFarver([ark(":root", mange)], (n) => `#${n.slice(3).padStart(6, "0")}`, 10);
    expect(f).toHaveLength(10);
  });

  it("et site UDEN brugbare variabler giver en tom liste — og standarderne står stadig", () => {
    expect(siteFarver([ark(":root", ["--gap"])], laes)).toEqual([]);
    expect(STANDARD_FARVER.length).toBeGreaterThanOrEqual(5);
    expect(STANDARD_FARVER.map((f) => f.vaerdi)).toContain("#ffffff");
  });
});

describe("værktøjslinjen bruger ingen native farvedialog", () => {
  it("der er ingen <input type=\"color\"> tilbage", () => {
    // Husets regel nævner den ved navn. Og den VIRKEDE ikke: OS-dialogen tager
    // fokus, markeringen forsvinder, og foreColor har intet at farve.
    expect(KODE).not.toMatch(/type\s*=\s*["']color["']/);
    expect(KODE).not.toMatch(/\.type\s*=\s*["']color["']/);
  });

  it("farveknappen åbner vores egen palet", () => {
    // Skrevet som setAttribute, ikke som attribut-syntaks. Første udgave af
    // denne prøve ledte efter 'data-testid="…"' og var rød på kode der var
    // rigtig — en assertion på en form jeg havde forestillet mig i stedet for
    // målt.
    expect(KODE).toContain('"data-testid", "inline-toolbar-color"');
    expect(KODE).toContain("toggleColorPicker(colorBtn)");
  });
});

describe("markeringen overlever at paletten åbner", () => {
  it("toggleColorPicker GEMMER markeringen", () => {
    const f = KODE.slice(KODE.indexOf("function toggleColorPicker"));
    const krop = f.slice(0, f.indexOf("\n}"));
    expect(krop).toContain("savedRange = sel.getRangeAt(0).cloneRange()");
  });

  it("applyColor GENSKABER den FØR farven sættes", () => {
    const f = KODE.slice(KODE.indexOf("function applyColor"));
    const krop = f.slice(0, f.indexOf("\n}"));
    const genskab = krop.indexOf("sel.addRange(savedRange)");
    const farv = krop.indexOf('execCommand("foreColor"');
    expect(genskab, "genskabelsen mangler").toBeGreaterThan(-1);
    expect(farv, "foreColor mangler").toBeGreaterThan(-1);
    // Rækkefølgen ER rettelsen: farves der før markeringen er tilbage,
    // rammer kaldet ingenting — præcis som før.
    expect(genskab).toBeLessThan(farv);
  });
});

describe("hver svatch har sit EGET anker", () => {
  it("testidNavn giver et kebab-anker uden danske tegn", () => {
    expect(testidNavn("Mørkegrå")).toBe("moerkegraa");
    expect(testidNavn("Hvid")).toBe("hvid");
    expect(testidNavn("brand primary")).toBe("brand-primary");
  });

  it("de fem standardfarver får FEM forskellige ankre", () => {
    const ankre = STANDARD_FARVER.map((f) => testidNavn(f.navn));
    expect(new Set(ankre).size, `kolliderende ankre: ${ankre.join(", ")}`).toBe(
      STANDARD_FARVER.length,
    );
    expect(ankre.every((a) => /^[a-z0-9-]+$/.test(a))).toBe(true);
  });

  it("koden bygger ankeret PR. FARVE — ikke ét delt id", () => {
    // Fem knapper med samme testid er fire knapper Lens aldrig kan trykke på.
    expect(KODE).toContain("`inline-color-swatch-${testidNavn(f.navn)}`");
    expect(KODE).toContain("`inline-color-site-swatch-${testidNavn(f.navn)}`");
    expect(KODE).not.toContain('svatch(f, "inline-color-swatch")');
  });
});
