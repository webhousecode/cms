/**
 * F189.2 — manuskriptet: prompten og valideringen.
 *
 * Delt fra I/O-halvdelen af samme grund som translate-changed-fields: hver vagt
 * skal kunne prøves uden et netværk, og kaldstedet skal læse som ét kald frem
 * for fyrre linjer orkestrering.
 *
 * DEN VIGTIGSTE FUNKTION HER ER parseManuskript(), og den er vigtig fordi den
 * er STRENG. En model der svarer noget der «ligner» et manuskript — en enkelt
 * replik, en taler vi ikke kender, en tom tekst — må ikke kunne skrive et halvt
 * dokument. Halvt skrevet er værre end ikke skrevet: det ser ud som om der er
 * noget, og det opdages først når nogen læser højt for penge.
 */

/** De to værter. Rollerne står i PROMPTEN, ikke i lyden — se byggManuskriptPrompt. */
export const VAERTER = ["aidan", "airina"] as const;
export type Vaert = (typeof VAERTER)[number];

export type Replik = { speaker: Vaert; text: string };

export type ParseSvar =
  | { ok: true; replikker: Replik[] }
  | { ok: false; grund: string };

/** Hvor lidt der skal til før det overhovedet er en samtale. */
const MINDST_ANTAL_REPLIKKER = 4;

/**
 * Læs modellens svar som et manuskript — eller sig præcist hvorfor ikke.
 *
 * Tager rå tekst, ikke et objekt: modellen svarer i JSON, ofte pakket ind i
 * ```json-hegn eller med en indledende sætning. At finde JSON-blokken er en del
 * af opgaven, ikke noget kalderen skal gøre først.
 */
export function parseManuskript(raa: string): ParseSvar {
  const blok = raa.match(/\[[\s\S]*\]/);
  if (!blok) {
    return { ok: false, grund: "svaret indeholder ingen JSON-liste" };
  }

  let data: unknown;
  try {
    data = JSON.parse(blok[0]);
  } catch (err) {
    return {
      ok: false,
      grund: `JSON-listen kunne ikke læses: ${err instanceof Error ? err.message : "ukendt fejl"}`,
    };
  }

  if (!Array.isArray(data)) {
    return { ok: false, grund: "svaret er ikke en liste" };
  }
  if (data.length < MINDST_ANTAL_REPLIKKER) {
    return {
      ok: false,
      grund: `kun ${data.length} replik(ker) — et afsnit er en samtale, ikke et oplæg (mindst ${MINDST_ANTAL_REPLIKKER})`,
    };
  }

  const replikker: Replik[] = [];
  for (const [i, r] of data.entries()) {
    if (typeof r !== "object" || r === null) {
      return { ok: false, grund: `replik ${i} er ikke et objekt` };
    }
    const { speaker, text } = r as Record<string, unknown>;
    if (typeof speaker !== "string" || !(VAERTER as readonly string[]).includes(speaker)) {
      // NAVNGIV den ukendte taler. En model der finder på en tredje vært er en
      // fejl man skal kunne se årsagen til, ikke gætte sig til.
      return {
        ok: false,
        grund: `replik ${i} har taleren «${String(speaker)}» — kun ${VAERTER.join(" og ")} findes`,
      };
    }
    if (typeof text !== "string" || text.trim() === "") {
      return { ok: false, grund: `replik ${i} (${speaker}) har ingen tekst` };
    }
    replikker.push({ speaker: speaker as Vaert, text: text.trim() });
  }

  // EN SAMTALE HAR TO STEMMER. En liste hvor kun den ene taler er et oplæg med
  // en talerangivelse på — og det ville blive indspillet som dialog uden at
  // nogen opdagede det før man lyttede.
  const brugte = new Set(replikker.map((r) => r.speaker));
  if (brugte.size < 2) {
    return {
      ok: false,
      grund: `kun «${[...brugte][0]}» taler — et afsnit med to værter skal have begge`,
    };
  }

  return { ok: true, replikker };
}

/**
 * Tegn i manuskriptet — grundlaget for prisestimatet (F189.3).
 *
 * KUN replik-teksten. Talernavnene sendes som struktur til dialog-endpointet,
 * ikke som tekst der skal læses højt, så de må ikke tælle med i et beløb vi
 * viser på en knap.
 */
export function manuskriptTegn(replikker: Replik[]): number {
  return replikker.reduce((sum, r) => sum + r.text.length, 0);
}

export type PromptTekster = {
  /** Hvad Aidan gør i samtalen. Bor i CMS, ikke her — se reservetekst nedenfor. */
  aidanRolle: string;
  /** Hvad Airina gør. */
  airinaRolle: string;
  /** Fælles rammer for tonen. */
  stil: string;
};

/**
 * Reservetekster — en NØDBREMSE, ikke tekstens hjem.
 *
 * Rollerne bor i CMS så de kan justeres uden en udrulning; det er hele grunden
 * til at de er en parameter. Findes værdien ikke, skal manuskript-generering
 * stadig virke frem for at fejle på en manglende streng.
 */
export const RESERVE_TEKSTER: PromptTekster = {
  aidanRolle:
    "Aidan forklarer. Han kender stoffet og siger det i almindelige ord, uden at tale ned.",
  airinaRolle:
    "Airina spørger på lytterens vegne. Hun må afbryde og bede om et konkret eksempel når det bliver for abstrakt.",
  stil:
    "Dansk, talesprog, korte sætninger. Ingen opremsninger og ingen overskrifter — det skal kunne siges højt.",
};

export function byggManuskriptPrompt(args: {
  artikelTitel: string;
  artikelTekst: string;
  tekster: PromptTekster;
}): { system: string; user: string } {
  const { aidanRolle, airinaRolle, stil } = args.tekster;
  return {
    system: [
      "Du skriver manuskript til et podcast-afsnit med to værter.",
      "",
      aidanRolle,
      airinaRolle,
      "",
      stil,
      "",
      "De to skal være reelt uenige hvor artiklen giver anledning til det —",
      "en samtale hvor den ene kun nikker, er et oplæg med to navne på.",
      "",
      'Svar KUN med en JSON-liste: [{"speaker":"aidan","text":"..."}, ...]',
      `Brug kun talerne ${VAERTER.join(" og ")}. Ingen indledning, ingen forklaring.`,
    ].join("\n"),
    user: `TITEL: ${args.artikelTitel}\n\n${args.artikelTekst}`,
  };
}
