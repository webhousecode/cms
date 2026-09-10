/* F194 — dansk tid ét sted. */
import { describe, it, expect } from "vitest";
import { dkDag, dkVaegur, icsUtc, DK_ZONE } from "../dansk-tid";

describe("den målte fejl", () => {
  it("2026-09-09T22:30:00Z er den 10. i Danmark, ikke den 9.", () => {
    // Præcis strengen fra målingen. slice(0,10) gav 2026-09-09.
    expect(dkDag("2026-09-09T22:30:00Z")).toBe("2026-09-10");
  });

  it("NEGATIV KONTROL: de ti første tegn ville have svaret forkert", () => {
    // Uden denne kunne hjælperen returnere slice(0,10) og bestå prøven ovenfor
    // på enhver anden dato.
    const iso = "2026-09-09T22:30:00Z";
    expect(dkDag(iso)).not.toBe(iso.slice(0, 10));
  });

  it("midt på dagen er de to enige — så fejlen var usynlig", () => {
    expect(dkDag("2026-09-09T12:00:00Z")).toBe("2026-09-09");
  });
});

describe("sommertid — prøvet BEGGE veje", () => {
  // Danmark er UTC+1 om vinteren og UTC+2 om sommeren. Et fast offset er
  // forkert et halvt år ad gangen, og det er den fejl der har et halvt års
  // lunte. Derfor to datoer der kun kan bestå begge med zone-NAVNET.
  it("sommer: UTC+2", () => {
    expect(dkVaegur("2026-07-01T10:00:00Z")).toBe("2026-07-01T12:00:00");
  });

  it("vinter: UTC+1", () => {
    expect(dkVaegur("2026-01-15T10:00:00Z")).toBe("2026-01-15T11:00:00");
  });

  it("de to forskyder sig FORSKELLIGT — ellers måler prøverne ovenfor intet", () => {
    const sommer = Number(dkVaegur("2026-07-01T10:00:00Z").slice(11, 13));
    const vinter = Number(dkVaegur("2026-01-15T10:00:00Z").slice(11, 13));
    expect(sommer - vinter).toBe(1);
  });

  it("selve skiftet: sidste time før sommertid", () => {
    // 2026-03-29 01:00Z → 03:00 dansk (uret springer fra 02 til 03).
    expect(dkVaegur("2026-03-29T01:00:00Z")).toBe("2026-03-29T03:00:00");
    expect(dkVaegur("2026-03-29T00:00:00Z")).toBe("2026-03-29T01:00:00");
  });

  it("zonen er et NAVN, ikke et offset", () => {
    expect(DK_ZONE).toBe("Europe/Copenhagen");
  });
});

describe("ICS udsender utvetydig tid", () => {
  it("altid UTC med Z — aldrig flydende", () => {
    expect(icsUtc("2026-09-09T22:30:00Z")).toBe("20260909T223000Z");
  });

  it("Z'et hører til strengen, ikke til kaldestedet", () => {
    // Før stod `${toIcsDate(...)}Z` — Z sat på bagefter uanset indholdet.
    expect(icsUtc(new Date())).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it("de to grene giver samme svar — før var de forskellig kode", () => {
    // Uden minutter blev strengen klippet; med minutter gik den gennem
    // new Date + lokale gettere. To veje, to resultater.
    expect(icsUtc("2026-09-09T22:30:00Z", 0)).toBe("20260909T223000Z");
    expect(icsUtc("2026-09-09T22:30:00Z", 15)).toBe("20260909T224500Z");
  });

  it("et kvarter over midnat ruller datoen korrekt", () => {
    expect(icsUtc("2026-09-09T23:50:00Z", 15)).toBe("20260910T000500Z");
  });

  it("en flydende tid uden zone tolkes som dansk vægur", () => {
    // localISO udsender netop denne form. Den skal ikke pludselig blive UTC.
    expect(icsUtc("2026-07-01T12:00:00")).toBe("20260701T100000Z");
  });
});

describe("den siger fra frem for at gætte", () => {
  it("et ugyldigt tidspunkt kaster", () => {
    expect(() => dkDag("ikke en dato")).toThrow();
    expect(() => icsUtc("ikke en dato")).toThrow();
  });
});
