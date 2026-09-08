/**
 * F189.3 — spørger udbyderen hvilke stemmer der findes LIGE NU.
 *
 * Hvorfor et LEVENDE opslag og ikke SDK'ets `checkVoice()`: den læser et
 * kurateret register, og et register er præcis den ting der bliver forældet
 * uden at nogen opdager det. SDK'ets egen dokumentation siger det højt om
 * modelsiden — et id den ikke kender, slipper igennem som `status:"unknown"`.
 * Et tjek der består på noget det ikke kender, er ikke et tjek.
 *
 * Så vi spørger ElevenLabs selv. `checkVoice()` er stadig det rigtige valg til
 * at VÆLGE en stemme (synkron, offline); den er bare ikke et bevis på at
 * stemmen svarer.
 */
import { elevenlabsAdapter, resolveVoice, ELEVENLABS_DANISH_VOICES } from "@broberg/ai-sdk";

export type StemmeOpslag =
  | { ok: true; navne: string[]; antal: number }
  | { ok: false; grund: string };

/**
 * Oversæt udbyderens svar til de navne et SITE faktisk har gemt.
 *
 * FÆLDEN, og den ville have gjort tjekket ubrugeligt: et site gemmer den
 * KURATEREDE stemme («jesper», «camilla»), mens udbyderen svarer med rå
 * voiceId'er. Sammenlignede vi de to direkte, ville hver eneste stemme se død
 * ud — et rødt tjek på et helt rask opsæt, hvilket er lige så ubrugeligt som et
 * grønt tjek på et brudt.
 *
 * Derfor returneres BEGGE former: id'et, og hvert kurateret navn hvis id er
 * blandt de levende.
 */
export function levendeNavne(live: { voiceId: string }[]): string[] {
  const ids = new Set(live.map((v) => v.voiceId));
  const ud = new Set<string>(ids);
  for (const navn of Object.keys(ELEVENLABS_DANISH_VOICES)) {
    if (ids.has(resolveVoice(navn))) ud.add(navn);
  }
  return [...ud];
}

/**
 * Slå de levende stemmer op hos udbyderen.
 *
 * Fejler ALDRIG kaldet ovenover: kan opslaget ikke laves (ingen nøgle, netværk
 * nede, 401), returneres grunden, og før-flyvnings-tjekket melder «ikke slået
 * op» frem for at antage at alt er i orden. Et tjek der stiltiende består når
 * ingen kunne spørge, ser grønt ud — og det er den fejlretning der gør skade.
 */
export async function hentLevendeStemmer(apiKey?: string): Promise<StemmeOpslag> {
  if (!apiKey) return { ok: false, grund: "der er ingen ElevenLabs-nøgle på dette site" };
  try {
    const live = await elevenlabsAdapter({ apiKey }).listVoices();
    if (!live.length) return { ok: false, grund: "udbyderen svarede uden en eneste stemme" };
    return { ok: true, navne: levendeNavne(live), antal: live.length };
  } catch (err) {
    return { ok: false, grund: err instanceof Error ? err.message : "opslaget fejlede" };
  }
}
