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
    ...(typeof d.udgivetAt === "string" ? { udgivetAt: d.udgivetAt } : {}),
  };
}

/** Eksporteret til prøven: den defensive læsning er en vagt, ikke en detalje. */
export const _laesData = laesData;
