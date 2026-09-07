/**
 * F189.1 — et podcast-afsnits fem tilstande.
 *
 * Ren og uden netværk, med vilje. Reglen «du kan ikke indspille et manuskript
 * ingen har godkendt» er den eneste spærre mellem en agent og ~$1,48 hos
 * ElevenLabs, og den skal kunne mutations-bevises uden at bruge pengene på det.
 *
 * FEM TILSTANDE, IKKE TO. `godkendt` er sit eget trin fordi det er dét trin der
 * låser op for den handling der koster penge. Uden det ville «indspil» være en
 * knap man kan komme til at trykke på, og problemet ville være AFSNITTET —
 * ikke knappen.
 */

export const TILSTANDE = [
  "kladde",
  "manuskript-klar",
  "godkendt",
  "indspillet",
  "udgivet",
] as const;

export type Tilstand = (typeof TILSTANDE)[number];

/**
 * De lovlige overgange, OPREGNET frem for udledt.
 *
 * En udledt regel («man må altid gå ét trin frem») ser rigtig ud og tillader
 * netop det den skal forhindre: at gå fra `kladde` til `indspillet` er også
 * «fremad» hvis man tæller trinene forkert. Listen her er derfor lang og kedelig
 * med vilje — hver pil er en beslutning nogen kan læse og bestride.
 */
const LOVLIGE: Record<Tilstand, readonly Tilstand[]> = {
  // Et manuskript skrives (eller genskrives) → klar til læsning.
  kladde: ["manuskript-klar"],

  // Mennesket læser og godkender. Eller skriver om og bliver hvor det er.
  "manuskript-klar": ["godkendt", "kladde"],

  // Godkendt kan indspilles — eller trækkes tilbage hvis manuskriptet rettes.
  // DEN TILBAGE-PIL ER IKKE PYNT: uden den kunne man godkende én tekst og
  // indspille en anden, og lyden ville høre til noget ingen havde sagt ja til.
  godkendt: ["indspillet", "manuskript-klar"],

  // Indspillet kan udgives — eller sendes tilbage hvis manuskriptet skal rettes,
  // hvilket koster en ny indspilning (lyden hører til ÉT manuskript).
  indspillet: ["udgivet", "manuskript-klar"],

  // Udgivet kan afpubliceres. Den vej tilbage findes fordi et afsnit der er
  // gået ud kan vise sig at være forkert, og «slet det» er ikke svaret.
  //
  // OG DEN KAN GÅ HELT TILBAGE TIL «manuskript-klar» — fundet af invariant-
  // prøven nedenfor, ikke af mig: retter man manuskriptet på et UDGIVET afsnit,
  // returnerer efterManuskriptRettelse «manuskript-klar», og uden denne pil
  // ville rettelsen efterlade afsnittet i en tilstand maskinen selv nægter at
  // nå. Og det ER den rigtige destination: er teksten ændret, passer den
  // udgivne lyd ikke længere til sine egne undertekster, så afsnittet skal ned
  // — ikke blot tilbage til «indspillet», hvor lyden stadig ville gælde.
  udgivet: ["indspillet", "manuskript-klar"],
};

export type OvergangSvar =
  | { ok: true }
  | { ok: false; grund: string };

/**
 * Må afsnittet gå fra `fra` til `til`?
 *
 * Svarer med en GRUND når nej. En tavs `false` bliver til en tavs no-op hos
 * kalderen, og en handling der ikke skete og ikke sagde noget er den fejlform
 * huset bruger mest tid på.
 */
export function maaSkifte(fra: Tilstand, til: Tilstand): OvergangSvar {
  if (fra === til) {
    return { ok: false, grund: `afsnittet er allerede «${til}»` };
  }
  const tilladte = LOVLIGE[fra];
  if (!tilladte) {
    return { ok: false, grund: `ukendt tilstand «${fra}»` };
  }
  if (!tilladte.includes(til)) {
    return {
      ok: false,
      grund:
        `«${fra}» kan ikke gå til «${til}» — ` +
        `herfra er kun ${tilladte.map((t) => `«${t}»`).join(" eller ")} lovlig`,
    };
  }
  return { ok: true };
}

/** Er strengen overhovedet en tilstand? Bruges hvor input kommer udefra. */
export function erTilstand(v: unknown): v is Tilstand {
  return typeof v === "string" && (TILSTANDE as readonly string[]).includes(v);
}

/**
 * Må afsnittet indspilles?
 *
 * Egen funktion frem for et `=== "godkendt"` spredt ud over ruterne: det er den
 * ENE regel der står mellem et kald og rigtige penge, og den skal kunne findes
 * ét sted når nogen om et halvt år spørger «hvad forhindrer en dobbelt-
 * indspilning?».
 */
export function maaIndspilles(tilstand: Tilstand): OvergangSvar {
  if (tilstand === "godkendt") return { ok: true };
  if (tilstand === "indspillet" || tilstand === "udgivet") {
    return {
      ok: false,
      grund:
        `afsnittet er allerede indspillet — en ny indspilning koster igen. ` +
        `Ret manuskriptet først, så falder godkendelsen bort af sig selv.`,
    };
  }
  return {
    ok: false,
    grund:
      `manuskriptet er ikke godkendt (står som «${tilstand}»). ` +
      `Indspilning bruger rigtige penge, så den kræver at et menneske har læst teksten.`,
  };
}

/**
 * Hvad en REDIGERING af manuskriptet gør ved tilstanden.
 *
 * Retter man teksten efter en godkendelse, falder godkendelsen bort. Ellers
 * kunne man godkende, rette, og indspille noget andet end det godkendte — og
 * intet ville fejle undervejs.
 *
 * Er afsnittet allerede indspillet eller udgivet, ryger det samme vej: lyden
 * hører til det gamle manuskript, og de to må ikke skride fra hinanden i
 * tavshed. Prisen for at rette er derfor en ny indspilning, og det er meningen.
 */
export function efterManuskriptRettelse(tilstand: Tilstand): Tilstand {
  if (tilstand === "kladde") return "kladde";
  return "manuskript-klar";
}
