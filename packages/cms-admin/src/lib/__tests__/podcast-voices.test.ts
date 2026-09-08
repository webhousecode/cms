/**
 * F189.3 AC#3 — stemme-tjekket skal spørge UDBYDEREN om stemmerne findes NU.
 *
 * Kriteriet blev skrevet fordi et register kan blive forældet uden at nogen
 * opdager det. SDK'ets `checkVoice()` læser netop et register og lader et
 * ukendt id passere som `status:"unknown"` — et tjek der består på noget det
 * ikke kender, er ikke et tjek. Derfor et levende opslag.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { levendeNavne, hentLevendeStemmer } from "../podcast/voices";
import { foerFlyvning } from "../podcast/preflight";
import { resolveVoice, ELEVENLABS_DANISH_VOICES } from "@broberg/ai-sdk";

const RUTE = readFileSync(
  new URL("../../app/api/podcast/[slug]/estimate/route.ts", import.meta.url),
  "utf8",
);

describe("levendeNavne — det et SITE har gemt, ikke kun rå id'er", () => {
  it("et kurateret navn regnes som levende når DETS id svarer", () => {
    // Fælden: sitet gemmer «jesper», udbyderen svarer med et voiceId. Uden
    // oversættelsen ville hver eneste stemme se død ud på et helt rask opsæt.
    const id = resolveVoice("jesper");
    const navne = levendeNavne([{ voiceId: id }]);
    expect(navne).toContain("jesper");
    expect(navne).toContain(id);
  });

  it("NEGATIV KONTROL: et kurateret navn hvis id IKKE svarer, er ikke levende", () => {
    // Uden denne ville «tilføj altid alle kuraterede navne» bestå prøven ovenfor.
    const navne = levendeNavne([{ voiceId: "et-id-ingen-kender" }]);
    expect(navne).not.toContain("jesper");
    expect(navne).toContain("et-id-ingen-kender");
  });

  it("to stemmer der begge svarer giver begge navne", () => {
    const navne = levendeNavne([
      { voiceId: resolveVoice("jesper") },
      { voiceId: resolveVoice("camilla") },
    ]);
    expect(navne).toContain("jesper");
    expect(navne).toContain("camilla");
  });

  it("et tomt svar giver ingen navne — ikke alle kuraterede", () => {
    expect(levendeNavne([])).toEqual([]);
  });

  it("registret vi oversætter fra er ikke tomt", () => {
    // Positiv kontrol: var ELEVENLABS_DANISH_VOICES tom, ville prøverne ovenfor
    // stadig bestå på deres id-halvdel, og oversættelsen ville aldrig køre.
    expect(Object.keys(ELEVENLABS_DANISH_VOICES).length).toBeGreaterThan(0);
  });
});

describe("opslaget fejler blødt — og siger hvorfor", () => {
  it("uden nøgle: ikke ok, med en grund der navngiver problemet", async () => {
    const r = await hentLevendeStemmer(undefined);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.grund).toContain("nøgle");
  });

  it("en tom nøglestreng behandles som ingen nøgle", async () => {
    const r = await hentLevendeStemmer("");
    expect(r.ok).toBe(false);
  });
});

describe("tjeklisten bruger opslaget rigtigt", () => {
  const grundlag = {
    replikker: [{ speaker: "aidan" as const, text: "hej" }],
    stemmer: ["jesper", "camilla"],
    godkendt: true,
  };

  it("begge valgte stemmer svarer → tjekket er grønt", () => {
    const f = foerFlyvning({
      ...grundlag,
      levendeStemmer: levendeNavne([
        { voiceId: resolveVoice("jesper") },
        { voiceId: resolveVoice("camilla") },
      ]),
    });
    const t = f.tjek.find((x) => x.navn === "Stemmerne svarer")!;
    expect(t.ok, t.detalje).toBe(true);
  });

  it("NEGATIV KONTROL: én stemme er død → tjekket er rødt OG navngiver hvilken", () => {
    const f = foerFlyvning({
      ...grundlag,
      levendeStemmer: levendeNavne([{ voiceId: resolveVoice("jesper") }]),
    });
    const t = f.tjek.find((x) => x.navn === "Stemmerne svarer")!;
    expect(t.ok).toBe(false);
    expect(t.detalje).toContain("camilla");
    expect(f.klar).toBe(false);
  });
});

describe("ruten slår faktisk op — ellers er modulet pynt", () => {
  it("estimat-ruten kalder hentLevendeStemmer", () => {
    expect(RUTE).toContain("hentLevendeStemmer");
  });

  it("levendeStemmer sendes KUN videre når opslaget lykkedes", () => {
    // Sendes en tom liste ved fejl, ville hver stemme se død ud; sendes intet,
    // melder tjekket ærligt «ikke slået op».
    expect(RUTE).toContain("...(opslag.ok ? { levendeStemmer: opslag.navne } : {})");
  });

  it("et fejlet opslag rapporteres til klienten frem for at forsvinde", () => {
    expect(RUTE).toContain("fejl: opslag.grund");
  });
});

/**
 * F189.3 AC#2 — grænsen omkring udtale.
 *
 * Kriteriet sagde oprindeligt at motoren skulle GENBRUGE broberg-ai-site's
 * `tilTale()`. Det blev vendt under bygningen, og begrundelsen står i
 * preflight.ts: en CMS-evne flere sites køber sig ind på, må ikke eje ÉT sites
 * udtale af «harness». Sitet sender sin ordbog; motoren validerer den.
 *
 * Men en vendt beslutning uden en prøve er bare en kommentar. Frygten bag det
 * oprindelige kriterium var at en KOPI ville lade bindestregs-fejlen vende
 * tilbage — og den frygt holder. Så prøven her holder fast i det der faktisk
 * forhindrer den: at motoren slet ikke har sin egen udtale-omskrivning.
 */
describe("motoren ejer ikke udtale — den validerer den", () => {
  const FILER = ["preflight.ts", "record.ts", "manuscript.ts", "generate.ts"];
  const KODE = FILER.map((f) =>
    readFileSync(new URL(`../podcast/${f}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, ""),
  ).join("\n");

  it("der findes ingen tilTale-agtig omskrivning i motoren", () => {
    expect(KODE).not.toMatch(/\btilTale\b/);
  });

  it("motoren har ingen indbygget udtale-ordbog", () => {
    // En hardkodet liste af ord ville være præcis den kopi der driver.
    expect(KODE).not.toMatch(/UDTALER\s*[:=]|ORDBOG\s*[:=]/);
  });

  it("ordbogen kommer ind som et ARGUMENT — det er formen der virker headless", () => {
    const pf = readFileSync(new URL("../podcast/preflight.ts", import.meta.url), "utf8");
    expect(pf).toContain("udtaler?: Udtale[]");
  });

  it("NEGATIV KONTROL: validatoren virker stadig — en IPA-række navngives", () => {
    const f = foerFlyvning({
      replikker: [{ speaker: "aidan" as const, text: "hej" }],
      udtaler: [{ word: "harness", ipa: "ˈhɑːnəs" }],
      stemmer: ["jesper", "camilla"],
      godkendt: true,
    });
    const t = f.tjek.find((x) => x.navn === "Udtale-ordbogen er ren")!;
    expect(t.ok).toBe(false);
    expect(t.detalje).toContain("harness");
  });
});
