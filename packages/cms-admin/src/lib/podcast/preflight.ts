/**
 * F189.3 — hvad koster det, og hvad vil fejle når vi trykker?
 *
 * Begge svar er FØRSTEKLASSES dele af API'et, ikke detaljer i cms-admins UI.
 * Grunden står i mockup'en: prisen skal stå PÅ knappen, og tjeklisten «Før
 * studiet» skal kunne vises af et site-panel vi ikke selv bygger. Kan et site
 * ikke spørge om dem, kan det ikke bygge den flade — og så er «komplet API»
 * ikke sandt.
 *
 * GRÆNSEN OMKRING UDTALE, rettet mens dette blev bygget:
 *
 * Planen sagde at motoren skulle GENBRUGE broberg-ai-site's `tilTale()` og
 * ordbog. Det kan den ikke: de bor i et andet repo, og cms har ingen
 * afhængighed dertil. Vigtigere er at den ville være FORKERT hvis den kunne —
 * en CMS-evne flere sites køber sig ind på, må ikke eje ét sites udtale af
 * «harness».
 *
 * Så motoren VALIDERER den ordbog den får, og ejer den ikke. Sitet sender sin
 * egen. Det er samtidig den eneste form der virker headless: et site-panel kan
 * spørge om sin egen ordbog holder, uden at vi kender den på forhånd.
 */
import type { Replik } from "./manuscript";
import { manuskriptTegn } from "./manuscript";

/**
 * ElevenLabs' pris pr. 1.000 RÅTEGN.
 *
 * MÅLT mod den faktiske regning 8/9-2026, ikke taget fra en prisliste. Tallet
 * var $0,15 (SDK'ets konstant) og er 50 % for højt. Tre uafhængige tal fra
 * kontoens forbrugsside for 2.-8. september går op:
 *
 *   $1,10 forbrug · 11.000 tegn · 75 kald à 40,4 kreditter = 3.030 kreditter
 *   $1,10 / 11.000 tegn                     = $0,100 pr. 1.000 tegn
 *   3.030 kreditter / 11.000 tegn           = 0,2755 kreditter pr. tegn
 *
 * Den sidste brøk er beviset for at tallene hører sammen: jeg havde uafhængigt
 * målt 0,2743 kreditter pr. tegn i tre kontrollerede syntesekørsler (70 tegn →
 * 19, 350 tegn → 96), og API'ets egen tæller for samme vindue sagde 3.031 mod
 * forbrugssidens 3.030.
 *
 * FÆLDEN der kostede mig en forkert konklusion først: /v1/usage/character-stats
 * rapporterer KREDITTER, ikke tegn — trods sit navn. Jeg læste dens 3.031 som
 * tegn, sammenlignede med vores 4.764 og konkluderede at estimatet var 3,6×
 * for højt. Det var 1,5×. To tal der måler forskellige ting ligner et afvig.
 *
 * FORBEHOLD: satsen er kontoens, ikke en listepris. Et andet site med sit eget
 * abonnement kan have en anden. I dag bruger kun ét site motoren, så tallet bor
 * her; bliver de flere, hører det til i site-konfigurationen ved siden af
 * nøglen. Se F189.3.
 */
export const PRIS_PR_1000_TEGN_USD = 0.1;

/** Talehastighed brugt til at anslå længden. Groft, og det siges i svaret. */
const TEGN_PR_MINUT = 900;

/**
 * USD → DKK.
 *
 * Christian 8/9: «Omregn til DKK». Han regner ikke i dollars, og et beløb han
 * skal omregne i hovedet er et beløb han ikke bruger.
 *
 * MÅLT 8. september 2026 kl. 02.02 (dansk tid): 6,4313, fra open.er-api.com.
 * Afrundet til 6,43 — en kurs med seks decimaler foregiver en præcision der
 * ikke er der på beløb under en tyver.
 *
 * DET ER ET ØJEBLIKSBILLEDE. En valutakurs bevæger sig; et par procent ændrer
 * ingen beslutning her, men står tallet uændret om et år er det forkert med
 * måske ti procent. Derfor rejser datoen med ud i svaret, så en klient kan vise
 * den frem for at lade som om kursen er evig.
 *
 * REGNINGEN KOMMER I DOLLARS — ElevenLabs fakturerer i USD. Kronebeløbet er en
 * oversættelse til læseren, ikke det tal der trækkes.
 */
export const USD_TIL_DKK = 6.43;
export const KURS_MAALT = "8. september 2026";

/** Kroner, dansk skrevet: komma som decimaltegn, ALTID to decimaler.
 *
 *  «1.54 kr» er engelsk og læses som halvandet tusinde af en der skimmer — og
 *  beløbet står på en knap der bruger penge. To decimaler altid, fordi penge
 *  skrives med ører, og fordi to beløb ved siden af hinanden ellers ville have
 *  hver sin form. */
export function dkk(usd: number): string {
  return `${(usd * USD_TIL_DKK).toFixed(2).replace(".", ",")} kr`;
}

export type Estimat = {
  tegn: number;
  prisUsd: number;
  /** Færdigformateret, så hver klient ikke skal kende kursen. */
  prisDkk: string;
  /** Datoen kursen blev målt — vises ved siden af beløbet. */
  kursMaalt: string;
  /** Selve kursen, så en klient kan omregne et HISTORISK beløb uden at have
   *  sin egen kopi af tallet. */
  kurs: number;
  minutter: number;
};

/**
 * Hvad ville denne indspilning koste?
 *
 * Bruger INGEN penge og kalder ingen udbyder. Det er hele meningen: en klient
 * skal kunne vise beløbet før nogen trykker.
 */
/** Prisen for et stykke ren TEKST — fx et sponsormanuskript, der ikke har en
 *  taler. Det er tegnene der koster, ikke hvem der siger dem. Samme vej som
 *  estimat(), så de to aldrig kan svare forskelligt. */
export function estimatForTekst(tekst: string): Estimat {
  return estimat([{ speaker: "aidan", text: tekst }]);
}

export function estimat(replikker: Replik[]): Estimat {
  const tegn = manuskriptTegn(replikker);
  const prisUsd = Math.ceil((tegn / 1000) * PRIS_PR_1000_TEGN_USD * 100) / 100;
  return {
    tegn,
    prisDkk: dkk(prisUsd),
    kursMaalt: KURS_MAALT,
    kurs: USD_TIL_DKK,
    // Afrundet til øre. Et beløb med fjorten decimaler på en knap ser ud som en
    // fejl, og et beløb der er FOR lavt er værre end et der er lidt for højt.
    prisUsd,
    minutter: Math.round((tegn / TEGN_PR_MINUT) * 10) / 10,
  };
}

/** En udtale-regel som sitet sender den. `ipa` er den ElevenLabs afviser. */
export type Udtale =
  | { word: string; alias: string }
  | { word: string; ipa: string };

export type Tjek = {
  navn: string;
  ok: boolean;
  /** Hvorfor — og hvad man gør ved det. Tom når ok. */
  detalje: string;
};

export type FoerFlyvning = {
  klar: boolean;
  tjek: Tjek[];
};

/**
 * Alt der kan fejle NÅR vi trykker, spurgt FØR vi trykker.
 *
 * Rækkefølgen er bevidst: de tjek der ikke koster noget kommer først, så en
 * klient kan vise dem uden at vente på et opslag hos udbyderen.
 */
export function foerFlyvning(args: {
  replikker: Replik[];
  udtaler?: Udtale[];
  /** Stemmerne der er valgt. Tom liste = ingen valgt endnu. */
  stemmer?: string[];
  /** Hvilke stemmer udbyderen svarer på LIGE NU. undefined = ikke slået op. */
  levendeStemmer?: string[];
  godkendt: boolean;
}): FoerFlyvning {
  const tjek: Tjek[] = [];

  // 1. Er der overhovedet et manuskript?
  const tegn = manuskriptTegn(args.replikker);
  tjek.push({
    navn: "Manuskriptet har indhold",
    ok: args.replikker.length > 0 && tegn > 0,
    detalje: args.replikker.length ? "" : "der er ingen replikker at indspille",
  });

  // 2. IPA — den MÅLTE forhindring. ElevenLabs-adapteren KASTER på ipa-rækker;
  //    kun alias virker der. Fanges her, før pengene bruges, frem for midt i en
  //    indspilning hvor fejlen kommer som en undtagelse fra en tredjepart.
  const ipaRaekker = (args.udtaler ?? []).filter((u) => "ipa" in u).map((u) => u.word);
  tjek.push({
    navn: "Udtale-ordbogen er ren",
    ok: ipaRaekker.length === 0,
    detalje: ipaRaekker.length
      ? `${ipaRaekker.length} række(r) bruger IPA, som udbyderen afviser: ` +
        `${ipaRaekker.join(", ")}. Skriv dem om som lyd-alias.`
      : "",
  });

  // 3. Stemmerne. To adskilte spørgsmål — er de VALGT, og svarer de.
  const valgte = args.stemmer ?? [];
  tjek.push({
    navn: "Begge stemmer er valgt",
    ok: valgte.length >= 2,
    detalje: valgte.length >= 2 ? "" : `kun ${valgte.length} stemme(r) valgt — der skal to til en samtale`,
  });

  if (args.levendeStemmer !== undefined) {
    const doede = valgte.filter((v) => !args.levendeStemmer!.includes(v));
    tjek.push({
      navn: "Stemmerne svarer",
      ok: doede.length === 0,
      detalje: doede.length ? `udbyderen kender ikke: ${doede.join(", ")}` : "",
    });
  } else {
    // «Ikke slået op» er IKKE det samme som «i orden». Et tjek der stiltiende
    // består når ingen har spurgt, er værre end intet tjek: det ser grønt ud.
    tjek.push({
      navn: "Stemmerne svarer",
      ok: false,
      detalje: "ikke slået op hos udbyderen endnu",
    });
  }

  // 4. Godkendelsen. Sidst, fordi den er menneskets og ikke maskinens.
  tjek.push({
    navn: "Din godkendelse",
    ok: args.godkendt,
    detalje: args.godkendt ? "" : "lyden kan ikke laves før manuskriptet er godkendt",
  });

  return { klar: tjek.every((t) => t.ok), tjek };
}
