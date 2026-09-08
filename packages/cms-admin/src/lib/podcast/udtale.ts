/**
 * F191.6 — udtale-ordbogen på vej ud til stemmen.
 *
 * MELDINGEN, 8/9: «Reklame speakeren kan IKKE udtale broberg.ai så han får
 * ikke den samme ordbog som vores normale stemmer?»
 *
 * Nej. Og der var tre lag under det spørgsmål:
 *
 *  1. Ordbogen FINDES — på broberg-ai-site, 34 rækker, brugt af sitets egen
 *     «Aidan læser artiklen» mod Azure. Den har aldrig kunnet nå herind.
 *  2. Feltet fandtes ikke i VORES version af pakken. cms kørte
 *     @broberg/ai-sdk 0.34.0; `pronunciations` kom i 0.39.0.
 *  3. Og på 0.41.1 har `ai.tts()` feltet, mens `ai.podcast()` IKKE har det.
 *     Så reklamen og Aidans overgangsreplik kan rettes; afsnittenes egne
 *     replikker kan ikke, før ai-sdk får det på dialog-endpointet.
 *
 * HVORFOR VI IKKE BARE SKRIVER LYDSKRIFTEN IND I TEKSTEN. Den nemme løsning er
 * at bytte «broberg.ai» ud med «broberg punktum A I» før afsendelse. Så ville
 * lydskriften stå i manuskriptet, i underteksterne, i søgningen og i det
 * dokument et menneske skal læse. Teksten skal forblive ren; kun LYDEN ændres.
 * Det er præcis derfor feltet findes i pakken — substitutionen sker i
 * adapteren, efter teksten er escaped.
 *
 * MOTOREN EJER INGEN ORD. Rækkerne kommer fra sitets egen konfiguration
 * (`SiteConfig.podcastUdtaler`). Der står med vilje ikke ét site-specifikt ord
 * i denne fil — det er den grænse F189.3 trak, og en prøve håndhæver den.
 */
import { readSiteConfig } from "@/lib/site-config";

/** En række som sitet skriver den. Samme form som SDK'ets `pronunciations`. */
export type UdtaleRaekke = { word: string; alias?: string; ipa?: string };

/**
 * Rækkerne ElevenLabs faktisk kan bruge.
 *
 * IPA fjernes fordi adapteren KASTER på den — ElevenLabs har ingen SSML, og
 * kun `alias` kan anvendes. `foerFlyvning()` advarer allerede om det før
 * pengene bruges; her sker frafiltreringen, så en enkelt IPA-række i sitets
 * ordbog ikke vælter hele indspilningen.
 *
 * Rækker uden hverken alias eller ipa er tomme og ryger også ud: de ville
 * ellers tælle med i «ordbogen er sendt» uden at kunne ændre noget.
 */
export function tilElevenLabs(raekker: UdtaleRaekke[]): { word: string; alias: string }[] {
  return raekker
    .filter((r) => typeof r.word === "string" && r.word.trim() !== "")
    .filter((r) => typeof r.alias === "string" && r.alias.trim() !== "")
    .map((r) => ({ word: r.word.trim(), alias: r.alias!.trim() }));
}

/**
 * Sitets ordbog, klar til at sende med et tts-kald.
 *
 * Svarer `undefined` — ikke `[]` — når sitet ingen ordbog har. Forskellen er
 * ikke kosmetisk: en tom liste er stadig et felt der sendes, og et site der
 * ikke har taget stilling skal ikke sende noget overhovedet (ship-dark).
 */
export async function sitetsUdtaler(): Promise<{ word: string; alias: string }[] | undefined> {
  let raekker: UdtaleRaekke[] = [];
  try {
    const cfg = await readSiteConfig();
    raekker = Array.isArray(cfg.podcastUdtaler) ? cfg.podcastUdtaler : [];
  } catch {
    // Kan konfigurationen ikke læses, indspilles der UDEN ordbog frem for
    // ikke at indspille. En forkert udtale er en skønhedsfejl; en fejlet
    // indspilning har kostet penge og givet ingenting.
    return undefined;
  }
  const brugbare = tilElevenLabs(raekker);
  return brugbare.length ? brugbare : undefined;
}

/**
 * Modellen sponsorindslaget og overgangen indtales med.
 *
 * MÅLT 8/9 efter ejerens spørgsmål — «podcast test med Aidan og Airina ER da
 * ElevenLabs eller er det måske stadig Azure?». Svaret er ElevenLabs begge
 * steder, men SDK'ets to standarder er ikke den samme model:
 *
 *   ai.podcast()  →  eleven_v3                (afsnittene · to stemmer)
 *   ai.tts()      →  eleven_multilingual_v2   (reklamen · overgangen)
 *
 * Han hørte forskellen før jeg havde målt den: «Aidan og Airina gjorde det
 * bedre». Samme udbyder, samme stemme-id, anden model — og v3 udtaler
 * «broberg.ai» rigtigt af sig selv, hvor v2 skulle have en lydskrift for at
 * komme i nærheden.
 *
 * At de to skulle være forskellige er heller ikke til at forsvare i sig selv:
 * reklamen ligger MIDT i afsnittet. Skifter lydkvaliteten når værten holder
 * pause, hører man det.
 *
 * VERIFICERET at /v1/text-to-speech tager imod v3 — ikke antaget: to
 * kontrollerede kald med samme tekst og samme stemme, begge HTTP 200
 * (v3 56.050 bytes, v2 33.898).
 */
export const SPONSOR_MODEL = { provider: "elevenlabs", model: "eleven_v3" } as const;
