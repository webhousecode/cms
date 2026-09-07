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
 * ElevenLabs' pris pr. 1.000 tegn, målt i @broberg/ai-sdk's egne konstanter
 * (F012). Ét sted, så beløbet på knappen og beløbet i regnskabet er det samme
 * tal.
 */
export const PRIS_PR_1000_TEGN_USD = 0.15;

/** Talehastighed brugt til at anslå længden. Groft, og det siges i svaret. */
const TEGN_PR_MINUT = 900;

export type Estimat = {
  tegn: number;
  prisUsd: number;
  minutter: number;
};

/**
 * Hvad ville denne indspilning koste?
 *
 * Bruger INGEN penge og kalder ingen udbyder. Det er hele meningen: en klient
 * skal kunne vise beløbet før nogen trykker.
 */
export function estimat(replikker: Replik[]): Estimat {
  const tegn = manuskriptTegn(replikker);
  return {
    tegn,
    // Afrundet til øre. Et beløb med fjorten decimaler på en knap ser ud som en
    // fejl, og et beløb der er FOR lavt er værre end et der er lidt for højt.
    prisUsd: Math.ceil((tegn / 1000) * PRIS_PR_1000_TEGN_USD * 100) / 100,
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
