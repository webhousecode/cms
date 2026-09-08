/**
 * F191.3 — sy flere lydstykker sammen til ÉN mp3.
 *
 * HVORFOR IKKE BARE SÆTTE FILERNE EFTER HINANDEN. Det var min første idé, og
 * den ser ud til at virke:
 *
 *   cat a.mp3 b.mp3 > c.mp3
 *   varighed   366,76 s   mod forventet 366,64   ← ser rigtig ud
 *   afkodning  «Header missing · Invalid data found»
 *
 * Hver mp3 starter med et ID3-mærke (bytes 49 44 33 = «ID3»), og det havner
 * midt i strømmen. Filen SPILLER indtil samlingen og går så i stå.
 *
 * Grunden til at jeg troede den virkede er værd at huske: ffprobe GÆTTER
 * varigheden ud fra filstørrelsen når strømmen er brudt. Varighedsfeltet er
 * altså lige så grønt på en ødelagt fil som på en hel. Beviset er en fuld
 * afkodning, og det er præcis hvad afkodRent() nedenfor gør.
 *
 * OG EN UPLOADET FIL ER IKKE VORES FORMAT. Kunden får sin reklame fra et
 * bureau: stereo, 48 kHz, VBR, m4a. Uden normalisering ville sammenføjningen
 * kun være korrekt for de indslag vi selv genererer — altså netop ikke det
 * funktionen findes til.
 *
 * Derfor ffmpeg, som normaliserer og samler i ét hug. Den skal være i
 * produktions-imaget; er den der ikke, siger vi det (se harFfmpeg).
 */
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const kør = promisify(execFile);

/** Vores format. Alt normaliseres hertil, så delene kan sys sammen. */
export const LYD_FORMAT = {
  hz: 44100,
  kanaler: 1,
  bitrate: "128k",
} as const;

/** Er ffmpeg til stede? Svaret bruges til at sige HVAD der mangler frem for at
 *  fejle med noget uforståeligt — eller værre, at levere en brudt fil. */
export async function harFfmpeg(): Promise<boolean> {
  try {
    await kør("ffmpeg", ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Afkoder filen RENT hele vejen igennem?
 *
 * Dette er prøven der kan skelne en hel fil fra en brudt — i modsætning til at
 * læse varigheden, som er den måling der narrede mig.
 */
export async function afkodRent(mp3: Uint8Array): Promise<{ ok: boolean; grund?: string }> {
  const mappe = await mkdtemp(join(tmpdir(), "wh-lyd-"));
  const sti = join(mappe, "t.mp3");
  try {
    await writeFile(sti, mp3);
    const { stderr } = await kør("ffmpeg", ["-v", "error", "-i", sti, "-f", "null", "-"], {
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (stderr.trim()) return { ok: false, grund: stderr.trim().split("\n")[0] };
    return { ok: true };
  } catch (err) {
    return { ok: false, grund: err instanceof Error ? err.message : "afkodningen fejlede" };
  } finally {
    await rm(mappe, { recursive: true, force: true });
  }
}

/** Længden i sekunder, målt på den AFKODEDE strøm — ikke på headerens påstand. */
export async function laengdeSek(lyd: Uint8Array): Promise<number | null> {
  const mappe = await mkdtemp(join(tmpdir(), "wh-lyd-"));
  const sti = join(mappe, "t");
  try {
    await writeFile(sti, lyd);
    // -count_frames tvinger ffprobe til at LÆSE strømmen frem for at gætte ud
    // fra filstørrelsen. Uden det svarer den også på en brudt fil.
    const { stdout } = await kør(
      "ffprobe",
      ["-v", "error", "-select_streams", "a:0", "-count_frames",
       "-show_entries", "stream=duration", "-of", "default=nw=1:nk=1", sti],
      { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const n = Number.parseFloat(stdout.trim().split("\n")[0] ?? "");
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  } finally {
    await rm(mappe, { recursive: true, force: true });
  }
}

export type SyResultat =
  | { ok: true; mp3: Uint8Array; sekunder: number }
  | { ok: false; grund: string };

/**
 * Sy stykkerne sammen i den rækkefølge de kommer.
 *
 * HVERT stykke normaliseres — også vores egne. Det er med vilje: en gren der
 * kun normaliserer «de fremmede» ville skulle afgøre hvad der er fremmed, og
 * dét er en beslutning der bliver forkert den dag udbyderen ændrer sit output.
 * Prisen er nogle sekunders CPU; gevinsten er at der kun findes én vej.
 */
export async function sySammen(stykker: Uint8Array[]): Promise<SyResultat> {
  if (!stykker.length) return { ok: false, grund: "der er ingen lydstykker at samle" };
  if (stykker.length === 1) {
    const sek = await laengdeSek(stykker[0]!);
    return sek === null
      ? { ok: false, grund: "kunne ikke måle længden af lydstykket" }
      : { ok: true, mp3: stykker[0]!, sekunder: sek };
  }
  if (!(await harFfmpeg())) {
    return {
      ok: false,
      grund:
        "ffmpeg mangler på serveren, og uden den kan lydstykkerne ikke samles. " +
        "Tilføj den til imaget (apk add ffmpeg) — en ren sammenkædning giver en " +
        "fil der ser hel ud og går i stå ved samlingen.",
    };
  }

  const mappe = await mkdtemp(join(tmpdir(), "wh-sy-"));
  try {
    const stier: string[] = [];
    for (const [i, s] of stykker.entries()) {
      const p = join(mappe, `d${i}`);
      await writeFile(p, s);
      stier.push(p);
    }
    const ud = join(mappe, "ud.mp3");
    const args = stier.flatMap((p) => ["-i", p]);
    await kør(
      "ffmpeg",
      [
        "-v", "error",
        ...args,
        "-filter_complex", `concat=n=${stier.length}:v=0:a=1[a]`,
        "-map", "[a]",
        "-ar", String(LYD_FORMAT.hz),
        "-ac", String(LYD_FORMAT.kanaler),
        "-b:a", LYD_FORMAT.bitrate,
        "-f", "mp3",
        ud,
      ],
      { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const mp3 = new Uint8Array(await readFile(ud));
    const sek = await laengdeSek(mp3);
    if (sek === null) return { ok: false, grund: "den samlede fil kunne ikke måles" };
    return { ok: true, mp3, sekunder: sek };
  } catch (err) {
    return { ok: false, grund: err instanceof Error ? err.message : "sammenføjningen fejlede" };
  } finally {
    await rm(mappe, { recursive: true, force: true });
  }
}
