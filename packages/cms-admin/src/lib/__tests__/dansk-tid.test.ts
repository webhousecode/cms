/* F194 — dansk tid ét sted. */
import { describe, it, expect } from "vitest";
import { dkDag, dkVaegur, dkKlokke, dkUrMinut, icsUtc, DK_ZONE } from "../dansk-tid";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

  it("en dato-tid UDEN zone afvises — den er et gæt", () => {
    // DET VAR MIN EGEN FEJL, og CI fandt den før jeg gjorde: prøven stod før
    // på .toBe("20260701T100000Z") og bestod LOKALT fordi Macen kører dansk
    // tid. I CI (UTC) gav samme streng 120000Z. Samme streng, to øjeblikke.
    // Præcis den fejlklasse denne fil findes for at lukke — så den gætter
    // ikke længere, den siger fra.
    expect(() => icsUtc("2026-07-01T12:00:00")).toThrow(/tidszone/);
    expect(() => dkDag("2026-07-01T12:00:00")).toThrow(/tidszone/);
  });

  it("men et rigtigt øjeblik går igennem — uanset hvordan zonen skrives", () => {
    expect(icsUtc("2026-07-01T12:00:00Z")).toBe("20260701T120000Z");
    expect(icsUtc("2026-07-01T12:00:00+02:00")).toBe("20260701T100000Z");
    expect(icsUtc(new Date("2026-07-01T12:00:00Z"))).toBe("20260701T120000Z");
  });

  it("en ren DATO er ikke tvetydig og slipper igennem", () => {
    // «2026-07-01» er en kalenderdag, ikke et vægur — spærren må ikke tage
    // den med, for dagnøglerne i kalenderen har netop den form.
    expect(() => dkDag("2026-07-01")).not.toThrow();
  });
});

describe("den siger fra frem for at gætte", () => {
  it("et ugyldigt tidspunkt kaster", () => {
    expect(() => dkDag("ikke en dato")).toThrow();
    expect(() => icsUtc("ikke en dato")).toThrow();
  });
});

describe("ugevisningens ur — én kilde til time og minut", () => {
  it("22:30Z placeres 00:30 dansk sommertid, ikke 22:30", () => {
    expect(dkUrMinut("2026-09-09T22:30:00Z")).toEqual([0, 30]);
  });

  it("vinter: samme vægur kommer af et ANDET øjeblik", () => {
    // Sommer +2, vinter +1. Var zonen et fast offset, ville den ene være forkert.
    expect(dkUrMinut("2026-01-09T23:30:00Z")).toEqual([0, 30]);
  });

  it("minuttet kommer fra ZONEN, ikke fra tegn 14-16 af strengen", () => {
    // ÆRLIGT om hvad der var galt: den gamle aflæsning gav det SAMME svar,
    // fordi Danmark er et helt antal timer fra UTC. Den var ikke forkert — den
    // var en anden mekanisme for samme tidspunkt, og den holdt kun på grund af
    // en egenskab ved vores zone som ingen havde skrevet ned.
    expect(dkUrMinut("2026-09-09T22:30:00Z")).toEqual([0, 30]);
    expect("2026-09-09T22:30:00Z".slice(14, 16)).toBe("30"); // enige — i DK
    // Zoner med halvtime-forskydning er dem der ville have skilt dem ad:
    const halvtime = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date("2026-09-09T22:30:00Z"));
    expect(halvtime).toBe("04:00");
    expect(halvtime.slice(3, 5)).not.toBe("2026-09-09T22:30:00Z".slice(14, 16));
  });

  it("time og minut er enige med det viste klokkeslæt", () => {
    const naar = "2026-06-15T07:05:00Z";
    const [t, m] = dkUrMinut(naar);
    expect(`${String(t).padStart(2, "0")}:${String(m).padStart(2, "0")}`).toBe(dkKlokke(naar));
  });
});

describe("PORTEN: kalenderen må ikke læse et tidsstempel råt igen", () => {
  // F194's egen regression. Fejlen var ikke at hjælperen manglede — den var at
  // ET kaldested sprang den over, og et rå udsnit af en UTC-streng ser i koden
  // nøjagtig ud som en dansk dag. Målt 10/9 EFTER den første rettelse: to
  // sådanne kaldesteder stod stadig tilbage i filen.
  const kilde = readFileSync(
    fileURLToPath(new URL("../../app/admin/(workspace)/scheduled/calendar-client.tsx", import.meta.url)),
    "utf8",
  );

  it("filen findes og er kalenderen — ellers måler porten ingenting", () => {
    expect(kilde.length).toBeGreaterThan(10_000);
    expect(kilde).toContain("dansk-tid");
  });

  it("ingen rå udsnit af et .date-tidsstempel", () => {
    const traef = kilde.match(/\.date\s*\.slice\s*\(/g) ?? [];
    expect(traef).toEqual([]);
  });

  it("ingen rå getHours/getDate på en begivenhed", () => {
    const traef = kilde.match(/\bevt?\.[a-z]*\.get(Hours|Date|Month|FullYear)\s*\(/gi) ?? [];
    expect(traef).toEqual([]);
  });
});

describe("PORTEN: hver `date` der når .ics skal kunne gå igennem icsUtc", () => {
  // DEN MÅLTE REGRESSION (10/9). Spærren mod zoneløse datotider er rigtig, men
  // den gjorde en glemt kopi til en nedbrudt rute: scheduled-snapshot.ts byggede
  // stadig «2026-09-11T03:00:00» af getFullYear()/getHours(), .ics-ruten kører
  // hver post gennem icsUtc, og kaldet ligger i ÉN try/catch om hele svaret —
  // så ét planlagt backup-punkt sendte hele kalenderabonnementet i fejl.
  //
  // Porten måler derfor ikke «findes hjælperen», men «kan det de PRODUCERER
  // overhovedet nå frem». To producenter, én forbruger.
  const producenter = [
    "../scheduled-snapshot",
    "../../app/api/admin/scheduled-events/route",
  ] as const;

  it.each(producenter)("%s bygger ikke en zoneløs dato-tid", async (rel) => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const sti = fileURLToPath(new URL(rel + ".ts", import.meta.url));
    const kilde = readFileSync(sti, "utf8");
    expect(kilde.length).toBeGreaterThan(500); // ellers måler porten ingenting
    // Det zoneløse mønster: en skabelon der selv samler YYYY-MM-DDTHH:MM.
    expect(kilde).not.toMatch(/\$\{pad\(d\.getMonth\(\)/);
    expect(kilde).not.toMatch(/getHours\(\)\)\}:\$\{pad\(d\.getMinutes/);
  });

  it("og formen de UDSENDER overlever turen til .ics", () => {
    // Positiv kontrol: den nye form går igennem.
    expect(icsUtc(new Date("2026-09-11T03:00:00Z").toISOString())).toBe("20260911T030000Z");
    // Negativ kontrol: den gamle form gør ikke — så prøven ovenfor måler noget.
    expect(() => icsUtc("2026-09-11T03:00:00")).toThrow(/ingen tidszone/);
  });
});
