/**
 * F191.7 — manuskriptet som en TEKSTFIL, ud og ind igen.
 *
 * Christian 8/9: «Lav Download og upload af manus … skal selvfølgeligt checkes
 * at et upload indeholder den rigtige syntaks.»
 *
 * HVORFOR IKKE JSON. Motoren taler JSON internt, men en fil et menneske skal
 * RETTE må ikke kræve at han tæller klammer og kommaer i en teksteditor. Et
 * glemt komma ville koste en runde frem og tilbage — og formatet nedenfor er
 * i forvejen sådan et manuskript ser ud:
 *
 *     AIRINA:
 *     Okay, jeg starter med at være uenig.
 *
 *     AIDAN:
 *     Det er rigtigt.
 *
 * VALIDERINGEN ER OPGAVEN, ikke en detalje. En fil der er halvt rigtig må
 * ALDRIG skrive en halv samtale: halvt skrevet er værre end ikke skrevet,
 * fordi det ser ud som om der er noget, og det opdages først når nogen læser
 * højt for penge. Derfor afvises hele filen, og der skrives intet.
 *
 * OG FEJLEN SKAL NAVNGIVE LINJEN. «Ugyldigt format» er ubrugeligt i en fil på
 * tres linjer — så leder man selv.
 */
import { VAERTER, type Replik, type Vaert } from "./manuscript";

/** Mindst dette antal replikker, som parseManuskript kræver af modellens svar.
 *  Samme tal, samme grund: et afsnit er en samtale, ikke et oplæg. */
const MINDST = 4;

/** Navnene som de står i filen. Store bogstaver, fordi de skal kunne ses når
 *  man skimmer — og fordi det er sådan et manuskript skrives. */
const TIL_FIL: Record<Vaert, string> = { aidan: "AIDAN", airina: "AIRINA" };

export type LaesSvar =
  | { ok: true; replikker: Replik[] }
  | { ok: false; grund: string; linje?: number };

/**
 * Replikker → tekstfil.
 *
 * Hovedet er kommentarer, så filen forklarer sig selv for den der åbner den
 * uden at have spurgt om formatet først.
 */
export function tilTekst(
  replikker: Replik[],
  hoved?: { titel?: string; nummer?: number; saeson?: number },
): string {
  const ud: string[] = [];
  if (hoved?.titel) ud.push(`# ${hoved.titel}`);
  const nr = [
    hoved?.nummer !== undefined ? `afsnit ${hoved.nummer}` : null,
    hoved?.saeson !== undefined ? `sæson ${hoved.saeson}` : null,
    `${replikker.length} replikker`,
  ].filter(Boolean);
  ud.push(`# ${nr.join(" · ")}`);
  ud.push("#");
  ud.push("# FORMAT: «AIDAN:» eller «AIRINA:» på sin egen linje, replikken under.");
  ud.push("# Tomme linjer og linjer der starter med # ignoreres.");
  ud.push("# Skift ikke navnene — kun de to værter findes.");
  ud.push("");
  for (const r of replikker) {
    ud.push(`${TIL_FIL[r.speaker]}:`);
    ud.push(r.text);
    ud.push("");
  }
  return ud.join("\n");
}

/**
 * Tekstfil → replikker, eller en besked der siger præcis hvad der er galt.
 *
 * Hver afvisning har sin egen grund og sit eget linjenummer. Det er ikke
 * høflighed: en samlet «ugyldigt format» tvinger den næste til at lede efter
 * fejlen i sin egen fil.
 */
export function fraTekst(raa: string): LaesSvar {
  // \r\n fra Windows og fra en tekst kopieret ud af en mail. Fjernes her frem
  // for at blive en del af replikkens tekst — et usynligt tegn i lyden er
  // netop den slags der ikke opdages.
  const linjer = raa.replace(/\r\n?/g, "\n").split("\n");

  const replikker: Replik[] = [];
  let aktuel: { vaert: Vaert; linje: number; dele: string[] } | null = null;
  let sidsteTaler = 0;

  const luk = (): LaesSvar | null => {
    if (!aktuel) return null;
    const tekst = aktuel.dele.join("\n").trim();
    if (!tekst) {
      return {
        ok: false,
        linje: aktuel.linje,
        grund: `linje ${aktuel.linje}: «${TIL_FIL[aktuel.vaert]}:» har ingen tekst under sig`,
      };
    }
    replikker.push({ speaker: aktuel.vaert, text: tekst });
    aktuel = null;
    return null;
  };

  for (const [i, raw] of linjer.entries()) {
    const nr = i + 1;
    const linje = raw.trim();

    // Kommentarer forsvinder altid. En tom linje gør det KUN uden for en
    // replik: står den inde i én, er den forfatterens afsnitsskift, og at
    // sluge den ville ændre teksten uden at nogen kunne se det. Fanget af
    // rundturs-prøven — min første udgave sprang alle tomme linjer over.
    if (linje.startsWith("#")) continue;
    if (!linje) {
      if (aktuel) aktuel.dele.push("");
      continue;
    }

    // En talerlinje er ET ord efterfulgt af kolon og intet andet. Kravet om
    // «intet andet» er bevidst: «AIDAN: Det er rigtigt» på én linje ville ellers
    // tavst blive læst som en taler uden tekst.
    const taler = /^([A-Za-zÆØÅæøå0-9._-]{1,40}):$/.exec(linje);
    if (taler) {
      const fejl = luk();
      if (fejl) return fejl;
      const navn = taler[1]!.toLowerCase();
      if (!(VAERTER as readonly string[]).includes(navn)) {
        return {
          ok: false,
          linje: nr,
          grund:
            `linje ${nr}: «${taler[1]}» er ikke en af værterne. ` +
            `Kun ${VAERTER.map((v) => TIL_FIL[v]).join(" og ")} findes.`,
        };
      }
      aktuel = { vaert: navn as Vaert, linje: nr, dele: [] };
      sidsteTaler = nr;
      continue;
    }

    if (!aktuel) {
      return {
        ok: false,
        linje: nr,
        grund:
          `linje ${nr}: der står tekst før den første taler. ` +
          `Hver replik skal begynde med «AIDAN:» eller «AIRINA:» på sin egen linje.`,
      };
    }
    aktuel.dele.push(raw.trimEnd());
  }

  const fejl = luk();
  if (fejl) return fejl;

  if (replikker.length === 0) {
    return { ok: false, grund: "filen indeholder ingen replikker" };
  }
  if (replikker.length < MINDST) {
    return {
      ok: false,
      linje: sidsteTaler,
      grund: `kun ${replikker.length} replik(ker) — et afsnit er en samtale, ikke et oplæg (mindst ${MINDST})`,
    };
  }
  return { ok: true, replikker };
}
