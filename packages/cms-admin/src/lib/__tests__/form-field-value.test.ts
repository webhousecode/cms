import { describe, it, expect } from "vitest";
import { formatFieldValue } from "../forms/field-value";

/**
 * Målt på to rigtige indsendelser på broberg.ai: feltet «Nyhedsbrev» stod i
 * mailen som `true`. Maskinens ord vist til et menneske.
 */
describe("et flueben er Ja eller Nej, ikke true", () => {
  it("skriver Ja på dansk og Yes på engelsk", () => {
    expect(formatFieldValue("true", "checkbox", "da")).toBe("Ja");
    expect(formatFieldValue("true", "checkbox", "en")).toBe("Yes");
  });

  it("skriver Nej — og et fravalg SKAL kunne ses, ikke bare mangle", () => {
    expect(formatFieldValue("false", "checkbox", "da")).toBe("Nej");
    expect(formatFieldValue(false, "checkbox", "en")).toBe("No");
  });

  it("tager både strengen og den ægte boolean", () => {
    // Kun strengformen er målt i drift; booleanen er en HTTP-detalje der kan
    // skifte, og et flueben må ikke blive til "true" fordi et lag ændrede type.
    expect(formatFieldValue(true, "checkbox", "da")).toBe("Ja");
    expect(formatFieldValue("on", "checkbox", "da")).toBe("Ja");
    expect(formatFieldValue("1", "checkbox", "da")).toBe("Ja");
  });

  it("viser noget uventet frem for at kalde det Nej", () => {
    // Et flueben med en værdi vi ikke kender er information, ikke et fravalg.
    // At oversætte den til "Nej" ville opfinde et svar personen ikke gav.
    expect(formatFieldValue("måske", "checkbox", "da")).toBe("måske");
  });
});

describe("TYPEN afgør, ikke værdien", () => {
  it("rører ikke et tekstfelt hvor nogen skrev ordet true", () => {
    // Den vigtigste test her. En gætte-regel på indholdet ville have lavet
    // denne besked om til "Ja".
    expect(formatFieldValue("true", "textarea", "da")).toBe("true");
    expect(formatFieldValue("true", "text", "da")).toBe("true");
    expect(formatFieldValue("false", undefined, "da")).toBe("false");
  });

  it("lader almindelige felter være i fred", () => {
    expect(formatFieldValue("Mette Sørensen", "text", "da")).toBe("Mette Sørensen");
    expect(formatFieldValue("a@b.dk", "email", "da")).toBe("a@b.dk");
    expect(formatFieldValue("42", "number", "da")).toBe("42");
    expect(formatFieldValue("AI-platform, hosting", "text", "da")).toBe("AI-platform, hosting");
  });
});

describe("en dato skrives som brevet skriver sin egen", () => {
  it("gør ISO til noget man læser", () => {
    expect(formatFieldValue("2026-09-04", "date", "da")).toBe("4. september 2026");
    expect(formatFieldValue("2026-09-04", "date", "en")).toBe("4 September 2026");
  });

  it("efterlader noget der ikke er en dato, urørt", () => {
    expect(formatFieldValue("i morgen", "date", "da")).toBe("i morgen");
    expect(formatFieldValue("", "date", "da")).toBe("");
  });
});
