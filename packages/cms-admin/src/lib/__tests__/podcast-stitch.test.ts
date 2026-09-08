/**
 * F191.3 — beviset for at lydstykkerne bliver til ÉN hel fil.
 *
 * Prøven er bygget om et enkelt forhold: en BRUDT mp3 og en HEL mp3 ser ens ud
 * hvis man måler varigheden. `cat a.mp3 b.mp3` gav 366,76 s mod forventet
 * 366,64 — og gik i stå ved samlingen. ffprobe gætter varigheden ud fra
 * filstørrelsen når strømmen er brudt.
 *
 * Derfor er den negative kontrol her ikke pynt: den kører den NAIVE metode
 * gennem SAMME afkodningsprøve, og hvis den består, måler prøven ikke det den
 * tror.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { sySammen, afkodRent, laengdeSek, harFfmpeg, LYD_FORMAT } from "../podcast/stitch";

const kør = promisify(execFile);

/**
 * INGEN «spring over hvis ffmpeg mangler».
 *
 * Første udgave af denne fil havde `if (!ffmpeg) return` i hver prøve. Så var
 * de grønne på en maskine uden ffmpeg — altså grønne på ingenting, hvilket er
 * præcis den fejlform kortet findes for at fjerne. Mangler ffmpeg, virker
 * funktionen ikke, og så SKAL prøven være rød.
 *
 * CI installerer den eksplicit (se .github/workflows/test.yml) frem for at
 * regne med at køreren tilfældigvis har den.
 */
beforeAll(async () => {
  const har = await harFfmpeg();
  if (!har) {
    throw new Error(
      "ffmpeg mangler. Lyd-sammenføjningen kan ikke prøves uden. " +
        "macOS: brew install ffmpeg · Alpine: apk add ffmpeg · Debian: apt-get install ffmpeg",
    );
  }
});

/** En rigtig mp3 i VORES format, lavet på stedet — ingen binær fil i repoet. */
async function toneVores(sek: number, hz: number): Promise<Uint8Array> {
  const m = await mkdtemp(join(tmpdir(), "wh-fix-"));
  const p = join(m, "t.mp3");
  try {
    await kør("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=${sek}`,
      "-ar", String(LYD_FORMAT.hz), "-ac", String(LYD_FORMAT.kanaler), "-b:a", LYD_FORMAT.bitrate, p]);
    return new Uint8Array(await readFile(p));
  } finally {
    await rm(m, { recursive: true, force: true });
  }
}

/** En FREMMED fil, som den kunden får fra sit bureau: stereo, 48 kHz, m4a. */
async function toneFremmed(sek: number): Promise<Uint8Array> {
  const m = await mkdtemp(join(tmpdir(), "wh-fix-"));
  const p = join(m, "t.m4a");
  try {
    await kør("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `sine=frequency=660:duration=${sek}`,
      "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k", p]);
    return new Uint8Array(await readFile(p));
  } finally {
    await rm(m, { recursive: true, force: true });
  }
}

describe("uden ffmpeg siger den HVAD der mangler", () => {
  it("beskeden navngiver værktøjet og advarer mod den naive genvej", async () => {
    // Læst af koden frem for fremtvunget: teksten er det eneste en driftsperson
    // får at se, og «sammenføjningen fejlede» ville ikke fortælle noget.
    const kilde = await readFile(new URL("../podcast/stitch.ts", import.meta.url), "utf8");
    expect(kilde).toContain("apk add ffmpeg");
    expect(kilde).toContain("går i stå ved samlingen");
  });
});

describe("sammenføjningen", () => {
  it("SKELNER hel fra brudt — den naive metode fejler afkodningen", async () => {
    const a = await toneVores(2, 440);
    const b = await toneVores(3, 880);
    const naiv = new Uint8Array([...a, ...b]);
    const r = await afkodRent(naiv);
    // Uden denne ville en prøve der altid siger «ok» bestå den næste test.
    expect(r.ok, `den naive metode BURDE fejle, men afkodede rent`).toBe(false);
  });

  it("to af vores egne filer bliver til én der afkoder RENT", async () => {
    const a = await toneVores(2, 440);
    const b = await toneVores(3, 880);
    const r = await sySammen([a, b]);
    expect(r.ok, r.ok ? "" : r.grund).toBe(true);
    if (!r.ok) return;
    const ren = await afkodRent(r.mp3);
    expect(ren.ok, ren.grund).toBe(true);
  });

  it("længden er summen af delene ± 0,5 sek, målt på den AFKODEDE strøm", async () => {
    const a = await toneVores(2, 440);
    const b = await toneVores(3, 880);
    const r = await sySammen([a, b]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(r.sekunder - 5)).toBeLessThan(0.5);
  });

  it("EN FREMMED FIL (stereo, 48 kHz, m4a) indgår korrekt", async () => {
    // Det er dén vej Christian beskrev: «der skal uploades nogle lydfiler fra
    // ekstern kilde». Uden normalisering ville kun vores egne virke.
    const vores = await toneVores(2, 440);
    const fremmed = await toneFremmed(3);
    const r = await sySammen([vores, fremmed, vores]);
    expect(r.ok, r.ok ? "" : r.grund).toBe(true);
    if (!r.ok) return;
    const ren = await afkodRent(r.mp3);
    expect(ren.ok, ren.grund).toBe(true);
    expect(Math.abs(r.sekunder - 7)).toBeLessThan(0.5);
  });

  it("SPONSOREN LANDER PÅ STEDET: overgangen starter hvor den skal ± 1 sek", async () => {
    // Tre stykker: 4 s afsnit, 2 s overgang, 3 s reklame. Overgangen skal
    // begynde ved 4 s. Målt på den samlede fils længde af de to første dele.
    const del1 = await toneVores(4, 440);
    const overgang = await toneVores(2, 660);
    const foer = await sySammen([del1, overgang]);
    expect(foer.ok).toBe(true);
    if (!foer.ok) return;
    // Overgangens START = hele filens længde minus overgangens egen længde.
    const overgangSek = await laengdeSek(overgang);
    expect(overgangSek).not.toBeNull();
    const start = foer.sekunder - (overgangSek ?? 0);
    expect(Math.abs(start - 4)).toBeLessThan(1);
  });

  it("ét stykke alene sys ikke om — det slipper igennem uændret", async () => {
    const a = await toneVores(2, 440);
    const r = await sySammen([a]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mp3.length).toBe(a.length);
  });

  it("en tom liste er en fejl med en grund, ikke en tom fil", async () => {
    const r = await sySammen([]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.grund).toContain("ingen lydstykker");
  });
});
