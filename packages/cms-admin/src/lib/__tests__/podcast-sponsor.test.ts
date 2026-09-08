/**
 * F191.1 + F191.2 — arkivet og overgangen.
 *
 * De bærende prøver her handler om GENBRUG, fordi det er kortets ord: «et arkiv
 * af sponsorerede beskeder der kan genbruges». Et indslag der virker én gang og
 * skal uploades igen til næste afsnit, opfylder ikke opgaven — og det ville
 * ikke kunne ses på nogen enkelt handling.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { maaBruges, brugtI, maaSlettes, type SponsorData } from "../podcast/sponsors";
import { overgangNoegle, skalHaveOvergang, OVERGANG_RESERVE } from "../podcast/bumper";

const KODE = (f: string) =>
  readFileSync(new URL(`../podcast/${f}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const helt: SponsorData = {
  titel: "Efterårskampagne",
  sponsor: "broberg.ai",
  lydUrl: "/uploads/sponsor/a.mp3",
  sekunder: 28,
  kilde: "tale",
  brugtIAfsnit: [],
  aktiv: true,
};

describe("et indslag kan kun bruges når det HAR lyd", () => {
  it("et helt indslag må bruges", () => {
    expect(maaBruges(helt).ok).toBe(true);
  });

  it("uden lyd må det IKKE bruges — og grunden siger hvorfor", () => {
    // Ellers ville sammenføjningen mangle et stykke, og resultatet blive en fil
    // hvor Aidan siger «vi tager en kort pause» og derefter ingenting.
    const r = maaBruges({ ...helt, lydUrl: undefined });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.grund).toContain("ingen lyd");
  });

  it("et indslag på pause må ikke bruges", () => {
    const r = maaBruges({ ...helt, aktiv: false });
    expect(r.ok).toBe(false);
  });

  it("KONTROL: spærren er ikke bare «altid nej»", () => {
    // Uden denne ville en maaBruges der altid afviser bestå de to ovenfor.
    expect(maaBruges({ ...helt, aktiv: true }).ok).toBe(true);
  });
});

describe("GENBRUG — kortets bærende ord", () => {
  const afsnit = [
    { slug: "afsnit-01", sponsorSlug: "broberg-efteraar" },
    { slug: "afsnit-02", sponsorSlug: "broberg-efteraar" },
    { slug: "afsnit-03", sponsorSlug: "en-anden" },
    { slug: "afsnit-04" },
  ];

  it("SAMME indslag på to afsnit — det er hele pointen", () => {
    expect(brugtI("broberg-efteraar", afsnit)).toEqual(["afsnit-01", "afsnit-02"]);
  });

  it("svarer på sponsorens eget spørgsmål: hvilke afsnit er jeg i", () => {
    expect(brugtI("en-anden", afsnit)).toEqual(["afsnit-03"]);
  });

  it("NEGATIV KONTROL: et ubrugt indslag giver en TOM liste, ikke alle afsnit", () => {
    expect(brugtI("findes-ikke", afsnit)).toEqual([]);
  });

  it("et afsnit uden sponsor tælles ikke med nogen", () => {
    expect(brugtI(undefined as unknown as string, afsnit)).toEqual([]);
  });

  it("listen læses ud af AFSNITTENE, ikke af sponsorens eget felt", () => {
    // De to kan drive fra hinanden, og af dem er afsnittene sandheden: det er
    // dem der bliver afspillet.
    const k = KODE("sponsors.ts");
    const f = k.slice(k.indexOf("export function brugtI"));
    expect(f.slice(0, f.indexOf("\n}"))).toContain("a.sponsorSlug === sponsorSlug");
  });
});

describe("sletning af noget der er i brug", () => {
  const afsnit = [{ slug: "afsnit-01", sponsorSlug: "i-brug" }, { slug: "afsnit-02" }];

  it("afvises — og NAVNGIVER afsnittene", () => {
    const r = maaSlettes("i-brug", afsnit);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // «kan ikke slettes» uden at sige hvor tvinger den næste til at lede.
    expect(r.grund).toContain("afsnit-01");
  });

  it("NEGATIV KONTROL: et ubrugt indslag MÅ slettes", () => {
    expect(maaSlettes("ubrugt", afsnit).ok).toBe(true);
  });
});

describe("overgangen genbruges — den må ikke lyde forskellig hver gang", () => {
  it("samme tekst + samme stemme giver SAMME nøgle", () => {
    const a = overgangNoegle(OVERGANG_RESERVE, "jesper");
    const b = overgangNoegle(OVERGANG_RESERVE, "jesper");
    expect(a).toBe(b);
  });

  it("en anden STEMME giver en ny nøgle — ellers genbruges den forkerte optagelse", () => {
    expect(overgangNoegle(OVERGANG_RESERVE, "jesper")).not.toBe(
      overgangNoegle(OVERGANG_RESERVE, "soren"),
    );
  });

  it("en anden TEKST giver en ny nøgle", () => {
    expect(overgangNoegle("Vi holder en pause.", "jesper")).not.toBe(
      overgangNoegle(OVERGANG_RESERVE, "jesper"),
    );
  });

  it("nøglen bruger BEGGE dele — en der kun så teksten ville bestå de to ovenfor halvt", () => {
    const k = KODE("bumper.ts");
    const f = k.slice(k.indexOf("export function overgangNoegle"));
    expect(f.slice(0, f.indexOf("\n}"))).toContain("${tekst} ${stemme}");
  });
});

describe("ingen overgang uden en sponsor", () => {
  it("med et indslag: ja", () => {
    expect(skalHaveOvergang("broberg-efteraar")).toBe(true);
  });

  it("uden: nej — «vi tager en kort pause» efterfulgt af næste replik er værre end intet", () => {
    expect(skalHaveOvergang(undefined)).toBe(false);
    expect(skalHaveOvergang(null)).toBe(false);
    expect(skalHaveOvergang("")).toBe(false);
  });

  it("kun mellemrum tæller som ingen sponsor", () => {
    expect(skalHaveOvergang("   ")).toBe(false);
  });
});
