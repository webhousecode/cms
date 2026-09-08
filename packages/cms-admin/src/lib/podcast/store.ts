/**
 * F189 — afsnittet som CMS-dokument.
 *
 * Manuskriptet er et DOKUMENT, ikke et mellemresultat. Det er planens bærende
 * valg: et genereret manuskript der går direkte i studiet er et afsnit ingen
 * har læst. Som dokument kan det åbnes, rettes og godkendes — og det er
 * samtidig underteksterne, det er søgbart, og det kan læses af en der ikke vil
 * lytte.
 *
 * SHIP-DARK. Motoren kræver at sitet erklærer en `podcast`-samling i sin
 * cms.config.ts. Gør det ikke det, svarer hver handling med en besked der siger
 * NØJAGTIG hvad der mangler — den går ikke ned, og den opretter ikke samlingen
 * selv. Sidstnævnte er ikke forsigtighed for forsigtighedens skyld: en skrivning
 * til produktions-konfiguration tager hele sitet ned hvis den er ugyldig, og den
 * vej tilbage går gennem den samme config (målt på broberg.ai 6/9).
 */
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { erTilstand, type Tilstand } from "./state";
import type { Replik } from "./manuscript";

export const PODCAST_SAMLING = "podcast";

/** Felterne et afsnit bærer. Skemaet nedenfor er det sitet skal erklære. */
export type AfsnitData = {
  /** Afsnittets plads i rækken — «07» i listen. Ejerens krav 8/9: man skal
   *  kunne bestemme hvor i sæsonen et afsnit placeres, også når det ikke kom
   *  fra en artikel. Valgfrit, fordi et afsnit godt må være unummereret mens
   *  det er en kladde; listen sorterer de unummererede sidst. */
  nummer?: number;
  /** Sæsonen afsnittet hører til. Ejeren 8/9: «24 afsnit om året som
   *  udgangspunkt» — altså en sæson pr. år, nummereret 1-24 indeni.
   *
   *  Feltet er ikke pynt: uden det ville sorteringen på nummer alene sætte
   *  sæson 1's afsnit 24 OVER sæson 2's afsnit 1, første gang tælleren starter
   *  forfra. Billigt at have nu, dyrt at føje til bagefter når dokumenterne
   *  mangler det. */
  saeson?: number;
  titel: string;
  /** Artiklen afsnittet er lavet ud fra — sporet, så man kan komme tilbage. */
  artikelSlug: string;
  tilstand: Tilstand;
  /** Manuskriptet. Gemmes som liste, ikke som én tekstklump: turtagningen ER
   *  strukturen, og dialog-endpointet skal have den som struktur. */
  replikker: Replik[];
  /** Stemmerne der blev valgt. Lyden nøgles på (manuskript + stemmer). */
  stemmer?: { aidan: string; airina: string };
  /** Sat når afsnittet er indspillet. */
  lydUrl?: string;
  lydNoegle?: string;
  /** Hvad indspilningen FAKTISK kostede — så «hvad kostede det» kan besvares
   *  bagefter og ikke kun estimeres. */
  faktiskPrisUsd?: number;
  udgivetAt?: string;
};

export type Afsnit = {
  slug: string;
  data: AfsnitData;
};

export type StoreSvar<T> = { ok: true; vaerdi: T } | { ok: false; grund: string };

/**
 * Findes `podcast`-samlingen i dette sites config?
 *
 * Beskeden er halvdelen af værdien: en nøgen «Unknown collection» tvinger den
 * næste til at gætte hvad der mangler. Denne fortæller det.
 */
export async function kraevPodcastSamling(): Promise<StoreSvar<true>> {
  const config = await getAdminConfig();
  const fundet = config.collections.find((c) => c.name === PODCAST_SAMLING);
  if (fundet) return { ok: true, vaerdi: true };
  return {
    ok: false,
    grund:
      `dette site har ingen «${PODCAST_SAMLING}»-samling. ` +
      `Podcast-motoren er slået fra indtil den er erklæret i cms.config.ts — ` +
      `se docs/features/F189-podcast-engine-api.md for skemaet. ` +
      `Motoren opretter den ikke selv: en ugyldig config tager hele sitet ned, ` +
      `og vejen tilbage går gennem den samme config.`,
  };
}

/** Læs ét afsnit. `null` betyder «findes ikke» — ikke en fejl. */
export async function hentAfsnit(slug: string): Promise<StoreSvar<Afsnit | null>> {
  const klar = await kraevPodcastSamling();
  if (!klar.ok) return klar;

  const cms = await getAdminCms();
  const doc = await cms.content.findBySlug(PODCAST_SAMLING, slug);
  if (!doc) return { ok: true, vaerdi: null };
  return { ok: true, vaerdi: { slug, data: laesData(doc.data) } };
}

export async function listAfsnit(): Promise<StoreSvar<Afsnit[]>> {
  const klar = await kraevPodcastSamling();
  if (!klar.ok) return klar;

  const cms = await getAdminCms();
  const { documents } = await cms.content.findMany(PODCAST_SAMLING, {});
  return {
    ok: true,
    vaerdi: (documents as { slug?: unknown; data?: unknown }[]).map((d) => ({
      slug: String(d.slug ?? ""),
      data: laesData(d.data),
    })),
  };
}

/**
 * Skriv felter på et afsnit — opretter det hvis det ikke findes.
 *
 * FLETTER frem for at erstatte. Samme grund som PATCH-ruten dokumenterer for
 * indhold generelt: et delvist skriv der erstatter hele `data` sletter tavst
 * alt kalderen ikke tilfældigvis huskede at sende med.
 */
export async function skrivAfsnit(
  slug: string,
  aendringer: Partial<AfsnitData>,
): Promise<StoreSvar<Afsnit>> {
  const klar = await kraevPodcastSamling();
  if (!klar.ok) return klar;

  const cms = await getAdminCms();
  const findes = await cms.content.findBySlug(PODCAST_SAMLING, slug);

  if (!findes) {
    const nyt: AfsnitData = {
      titel: "",
      artikelSlug: "",
      tilstand: "kladde",
      replikker: [],
      ...aendringer,
    };
    await cms.content.create(PODCAST_SAMLING, {
      slug,
      data: nyt as unknown as Record<string, unknown>,
      status: "draft",
    });
  } else {
    const flettet = { ...laesData(findes.data), ...aendringer };
    await cms.content.update(PODCAST_SAMLING, findes.id, {
      data: flettet as unknown as Record<string, unknown>,
    });
  }

  // LÆS TILBAGE FRA EN FRISK OPSLAG, ikke fra det vi lige sendte. En skrivning
  // der 200'er og ikke landede ser identisk ud herfra, og et gem-felt er ikke
  // bevist før værdien er læst tilbage.
  const efter = await cms.content.findBySlug(PODCAST_SAMLING, slug);
  if (!efter) {
    return { ok: false, grund: `afsnittet «${slug}» findes ikke efter skrivningen` };
  }
  return { ok: true, vaerdi: { slug, data: laesData(efter.data) } };
}

/**
 * Opret et afsnit UDEN en artikel.
 *
 * Ejerens krav 8/9-2026: «trods at vi tager udgangspunkt i sitets artikler så
 * SKAL man altså også kunne oprette et manuskript manuelt og bestemme hvor i
 * sæsonen det skal placeres.»
 *
 * Indtil nu var `genererManuskript` den ENESTE vej til et nyt afsnit, og PATCH
 * er med vilje et RETTELSES-verbum der 404\'er på noget der ikke findes. Det
 * betød at en fast intro — eller et hvilket som helst afsnit der ikke stammer
 * fra en artikel — ikke kunne laves gennem API\'et overhovedet. Målt 7/9: jeg
 * måtte oprette introen ad bagvejen gennem indholds-API\'et.
 *
 * Afviser hvis afsnittet findes i forvejen. Et «opret» der stiltiende
 * overskriver et manuskript nogen har skrevet, er ikke et opret.
 */
export async function opretAfsnit(
  slug: string,
  felter: { titel?: string; nummer?: number; saeson?: number } = {},
): Promise<StoreSvar<Afsnit>> {
  const klar = await kraevPodcastSamling();
  if (!klar.ok) return klar;

  const cms = await getAdminCms();
  const findes = await cms.content.findBySlug(PODCAST_SAMLING, slug);
  if (findes) {
    return { ok: false, grund: `afsnittet «${slug}» findes allerede` };
  }

  return skrivAfsnit(slug, {
    titel: felter.titel ?? "",
    artikelSlug: "",
    tilstand: "kladde",
    replikker: [],
    ...(typeof felter.nummer === "number" ? { nummer: felter.nummer } : {}),
    ...(typeof felter.saeson === "number" ? { saeson: felter.saeson } : {}),
  });
}

/**
 * Læs et dokuments data som et afsnit, defensivt.
 *
 * Dataen kommer fra et JSON-dokument nogen kan have redigeret i admin-editoren,
 * så intet felt er garanteret. En manglende tilstand bliver til «kladde» frem
 * for undefined: en tilstandsmaskine der får undefined ind, svarer «ukendt
 * tilstand» på alt, og fejlen ville se ud som om afsnittet var ødelagt.
 */
function laesData(raa: unknown): AfsnitData {
  const d = (raa ?? {}) as Record<string, unknown>;
  const tilstand = erTilstand(d.tilstand) ? d.tilstand : "kladde";
  return {
    titel: typeof d.titel === "string" ? d.titel : "",
    artikelSlug: typeof d.artikelSlug === "string" ? d.artikelSlug : "",
    tilstand,
    replikker: Array.isArray(d.replikker) ? (d.replikker as Replik[]) : [],
    ...(d.stemmer ? { stemmer: d.stemmer as AfsnitData["stemmer"] } : {}),
    ...(typeof d.lydUrl === "string" ? { lydUrl: d.lydUrl } : {}),
    ...(typeof d.lydNoegle === "string" ? { lydNoegle: d.lydNoegle } : {}),
    ...(typeof d.faktiskPrisUsd === "number" ? { faktiskPrisUsd: d.faktiskPrisUsd } : {}),
    ...(typeof d.nummer === "number" && Number.isFinite(d.nummer) ? { nummer: d.nummer } : {}),
    ...(typeof d.saeson === "number" && Number.isFinite(d.saeson) ? { saeson: d.saeson } : {}),
    ...(typeof d.udgivetAt === "string" ? { udgivetAt: d.udgivetAt } : {}),
  };
}

/** Eksporteret til prøven: den defensive læsning er en vagt, ikke en detalje. */
export const _laesData = laesData;
