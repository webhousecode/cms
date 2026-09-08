/**
 * F191.7 — kursen slås op, og den fejler ÅBENT.
 *
 * Den halvdel der betyder noget er reserven. At opslaget virker kan man se
 * ved at kigge; at reserven virker kan kun bevises ved at LADE opslaget fejle.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { hentKurs, nulstilKurs, RESERVE_KURS } from "../podcast/valutakurs";

const svar = (body: unknown, ok = true): typeof fetch =>
  (async () => ({ ok, json: async () => body }) as unknown as Response) as unknown as typeof fetch;

const kaster: typeof fetch = (async () => {
  throw new Error("netværket er nede");
}) as unknown as typeof fetch;

describe("et godt opslag bruges", () => {
  beforeEach(() => nulstilKurs());

  it("kursen kommer fra svaret, ikke fra reserven", () => {
    // KONTROL indbygget: 7,11 er bevidst forskellig fra reserven, så en
    // implementation der altid svarer reserve ikke kan bestå.
    return hentKurs(svar({ rates: { DKK: 7.1123 }, time_last_update_utc: "Tue, 08 Sep 2026 00:02:31 +0000" }))
      .then((k) => {
        expect(k.kurs).toBe(7.11);
        expect(k.kurs).not.toBe(RESERVE_KURS);
        expect(k.kilde).toBe("opslag");
      });
  });

  it("datoen kommer fra tjenestens eget tidsstempel", async () => {
    const k = await hentKurs(svar({ rates: { DKK: 6.5 }, time_last_update_utc: "Tue, 08 Sep 2026 00:02:31 +0000" }));
    expect(k.maalt).toContain("2026");
    expect(k.maalt).toContain("september");
  });

  it("afrundes til to decimaler — seks foregiver en præcision der ikke er der", async () => {
    const k = await hentKurs(svar({ rates: { DKK: 6.431278 } }));
    expect(k.kurs).toBe(6.43);
  });
});

describe("FEJLER ÅBENT — reserven er hele pointen", () => {
  beforeEach(() => nulstilKurs());

  it("netværket nede → reserven, og svaret SIGER det", async () => {
    const k = await hentKurs(kaster);
    expect(k.kurs).toBe(RESERVE_KURS);
    expect(k.kilde).toBe("reserve");
  });

  it("HTTP-fejl → reserven", async () => {
    const k = await hentKurs(svar({ rates: { DKK: 6.5 } }, false));
    expect(k.kilde).toBe("reserve");
  });

  it("svar uden DKK → reserven", async () => {
    const k = await hentKurs(svar({ rates: { EUR: 0.9 } }));
    expect(k.kilde).toBe("reserve");
  });

  it("en kurs der ikke er et tal → reserven", async () => {
    const k = await hentKurs(svar({ rates: { DKK: "6,43" } }));
    expect(k.kilde).toBe("reserve");
  });

  it("en URIMELIG kurs → reserven", async () => {
    // USD/DKK har ligget mellem 5 og 8 i årtier. Et svar på 0 eller 900 er
    // ikke en kurs — det er en fejl der er sluppet igennem som gyldig JSON,
    // og den ville gøre en indspilning gratis eller uoverkommelig på skærmen.
    for (const gal of [0, -1, 2.9, 12.1, 900]) {
      nulstilKurs();
      expect((await hentKurs(svar({ rates: { DKK: gal } }))).kilde, String(gal)).toBe("reserve");
    }
  });

  it("KONTROL: den falder ikke bare ALTID tilbage", async () => {
    // Uden denne ville en hentKurs der ignorerede svaret bestå alt ovenfor.
    nulstilKurs();
    expect((await hentKurs(svar({ rates: { DKK: 7.5 } }))).kilde).toBe("opslag");
  });
});

describe("der slås ikke op ved hver visning", () => {
  beforeEach(() => nulstilKurs());

  it("andet kald rammer cachen", async () => {
    let kald = 0;
    const taeller: typeof fetch = (async () => {
      kald++;
      return { ok: true, json: async () => ({ rates: { DKK: 6.9 } }) } as unknown as Response;
    }) as unknown as typeof fetch;
    await hentKurs(taeller);
    await hentKurs(taeller);
    expect(kald).toBe(1);
  });

  it("RESERVEN caches IKKE — et enkelt glip må ikke låse os i seks timer", async () => {
    let kald = 0;
    const foerstFejl: typeof fetch = (async () => {
      kald++;
      if (kald === 1) throw new Error("glip");
      return { ok: true, json: async () => ({ rates: { DKK: 6.9 } }) } as unknown as Response;
    }) as unknown as typeof fetch;
    expect((await hentKurs(foerstFejl)).kilde).toBe("reserve");
    expect((await hentKurs(foerstFejl)).kilde).toBe("opslag");
  });
});
