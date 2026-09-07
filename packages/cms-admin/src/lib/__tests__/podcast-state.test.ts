/**
 * F189.1 — tilstandsmaskinen er den ENESTE spærre mellem et kald og ~$1,48.
 *
 * Derfor prøves den uden netværk: reglen «du kan ikke indspille et manuskript
 * ingen har godkendt» skal kunne mutations-bevises uden at bruge pengene på det.
 *
 * De negative kontroller er hovedsagen. En tilstandsmaskine der siger JA til
 * alt består enhver prøve der kun spørger «må jeg gå fremad?».
 */
import { describe, it, expect } from "vitest";
import {
  TILSTANDE,
  maaSkifte,
  erTilstand,
  maaIndspilles,
  efterManuskriptRettelse,
  type Tilstand,
} from "../podcast/state";

describe("de fem tilstande", () => {
  it("er præcis fem, i rækkefølge", () => {
    expect(TILSTANDE).toEqual([
      "kladde",
      "manuskript-klar",
      "godkendt",
      "indspillet",
      "udgivet",
    ]);
  });

  it("erTilstand afviser alt andet — input kommer udefra", () => {
    expect(erTilstand("godkendt")).toBe(true);
    expect(erTilstand("Godkendt")).toBe(false);
    expect(erTilstand("færdig")).toBe(false);
    expect(erTilstand(undefined)).toBe(false);
    expect(erTilstand(3)).toBe(false);
  });
});

describe("lovlige overgange", () => {
  it("den normale vej hele vejen igennem", () => {
    const vej: [Tilstand, Tilstand][] = [
      ["kladde", "manuskript-klar"],
      ["manuskript-klar", "godkendt"],
      ["godkendt", "indspillet"],
      ["indspillet", "udgivet"],
    ];
    for (const [fra, til] of vej) {
      expect(maaSkifte(fra, til), `${fra} → ${til}`).toEqual({ ok: true });
    }
  });

  it("godkendelsen kan trækkes TILBAGE — ellers kunne man godkende ét og indspille et andet", () => {
    expect(maaSkifte("godkendt", "manuskript-klar").ok).toBe(true);
    expect(maaSkifte("indspillet", "manuskript-klar").ok).toBe(true);
  });

  it("et udgivet afsnit kan afpubliceres — «slet det» er ikke svaret på en fejl", () => {
    expect(maaSkifte("udgivet", "indspillet").ok).toBe(true);
  });
});

describe("NEGATIVE KONTROLLER — det maskinen findes for at nægte", () => {
  it("man kan ikke springe godkendelsen over", () => {
    const svar = maaSkifte("manuskript-klar", "indspillet");
    expect(svar.ok).toBe(false);
    expect(svar.ok === false && svar.grund).toMatch(/kan ikke gå til/);
  });

  it("man kan ikke gå fra kladde direkte til indspillet — «fremad» er ikke en regel", () => {
    expect(maaSkifte("kladde", "indspillet").ok).toBe(false);
    expect(maaSkifte("kladde", "udgivet").ok).toBe(false);
    expect(maaSkifte("kladde", "godkendt").ok).toBe(false);
  });

  it("man kan ikke udgive noget der ikke er indspillet", () => {
    expect(maaSkifte("godkendt", "udgivet").ok).toBe(false);
    expect(maaSkifte("manuskript-klar", "udgivet").ok).toBe(false);
  });

  it("en overgang til SAMME tilstand afvises frem for at være en tavs no-op", () => {
    for (const t of TILSTANDE) {
      const svar = maaSkifte(t, t);
      expect(svar.ok, t).toBe(false);
      expect(svar.ok === false && svar.grund).toContain("allerede");
    }
  });

  it("hver afvisning NAVNGIVER hvad der så er lovligt", () => {
    // En nøgen «nej» tvinger den næste til at læse kildekoden for at komme
    // videre. Beskeden skal kunne handles på.
    const svar = maaSkifte("kladde", "udgivet");
    expect(svar.ok).toBe(false);
    expect(svar.ok === false && svar.grund).toContain("manuskript-klar");
  });
});

describe("maaIndspilles — den ene regel der står mellem et kald og rigtige penge", () => {
  it("kun et GODKENDT afsnit må indspilles", () => {
    expect(maaIndspilles("godkendt")).toEqual({ ok: true });
  });

  it("NEGATIV KONTROL: alle fire andre tilstande afvises", () => {
    for (const t of TILSTANDE.filter((x) => x !== "godkendt")) {
      expect(maaIndspilles(t).ok, t).toBe(false);
    }
  });

  it("afvisningen siger HVORFOR — og at det koster penge", () => {
    const svar = maaIndspilles("manuskript-klar");
    expect(svar.ok === false && svar.grund).toMatch(/ikke godkendt/);
    expect(svar.ok === false && svar.grund).toMatch(/penge/);
  });

  it("et allerede indspillet afsnit får en ANDEN besked end et ugodkendt", () => {
    // De to nej'er har forskellig årsag og forskellig vej videre. Én fælles
    // besked ville sende den ene af dem det forkerte sted hen.
    const a = maaIndspilles("indspillet");
    const b = maaIndspilles("kladde");
    expect(a.ok === false && a.grund).not.toBe(b.ok === false && b.grund);
    expect(a.ok === false && a.grund).toMatch(/allerede indspillet/);
  });
});

describe("efterManuskriptRettelse — en rettelse må ikke kunne snige sig forbi godkendelsen", () => {
  it("en rettelse EFTER godkendelse trækker godkendelsen tilbage", () => {
    expect(efterManuskriptRettelse("godkendt")).toBe("manuskript-klar");
  });

  it("også når afsnittet er indspillet eller udgivet — lyden hører til ÉT manuskript", () => {
    expect(efterManuskriptRettelse("indspillet")).toBe("manuskript-klar");
    expect(efterManuskriptRettelse("udgivet")).toBe("manuskript-klar");
  });

  it("en kladde bliver liggende som kladde", () => {
    expect(efterManuskriptRettelse("kladde")).toBe("kladde");
  });

  it("resultatet er ALTID en lovlig destination fra sin egen udgangstilstand", () => {
    // Den egenskab er hele pointen: en rettelse må ikke kunne efterlade
    // afsnittet i en tilstand maskinen ellers ville have nægtet at nå.
    for (const t of TILSTANDE) {
      const efter = efterManuskriptRettelse(t);
      if (efter === t) continue;
      expect(maaSkifte(t, efter).ok, `${t} → ${efter}`).toBe(true);
    }
  });
});
