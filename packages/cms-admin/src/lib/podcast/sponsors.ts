/**
 * F191.1 — sponsor-arkivet.
 *
 * Christian: «Lav CMS tools til dette så den enkelte kunde kan have et arkiv af
 * sponsorerede beskeder der kan genbruges og stitches ind i afsnittet bestemte
 * steder.»
 *
 * ORDET «ARKIV» ER ARKITEKTUREN. En sponsor køber sjældent ét afsnit. Hang
 * reklamen på afsnittet, skulle den samme lydfil uploades tolv gange når en
 * sponsor køber tolv afsnit — og ingen kunne svare på HVILKE afsnit en sponsor
 * optræder i. Det er det første en sponsor spørger om, og det eneste spørgsmål
 * der gør funktionen til monetization frem for til en lydfil.
 *
 * Så et indslag er et DOKUMENT, og afsnittet peger på det.
 *
 * TO KILDER TIL LYDEN, ÉT DOKUMENT: kunden uploader fra sit bureau, eller vi
 * genererer den med en stemme. Forskellen står i `kilde`, men resten af
 * systemet behandler dem ens — ellers ville sammenføjningen skulle kende
 * forskellen, og det er præcis den gren der bliver forkert.
 */
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import type { StoreSvar } from "./store";

export const SPONSOR_SAMLING = "sponsorer";

export type SponsorData = {
  /** Hvad indslaget hedder internt — «Efterårskampagne, 30 sek». */
  titel: string;
  /** Sponsorens navn, som det står i en rapport til dem. */
  sponsor: string;
  /** Lyden. Uden den kan indslaget ikke vælges på et afsnit. */
  lydUrl?: string;
  /** Målt på den afkodede strøm ved upload — ikke gættet ud fra filstørrelsen. */
  sekunder?: number;
  /** Hvor lyden kom fra. `tale` = vi genererede den; `upload` = kunden hentede
   *  den hos sit bureau. */
  kilde?: "upload" | "tale";
  /** Kun for `tale`: manuskriptet og stemmen, så indslaget kan laves om. */
  manuskript?: string;
  stemme?: string;
  /** Hvilke afsnit indslaget er brugt i. Skrives af motoren, ikke af hånden —
   *  det er svaret på sponsorens eget spørgsmål. */
  brugtIAfsnit?: string[];
  aktiv?: boolean;
};

export type Sponsor = { slug: string; data: SponsorData };

/** Findes `sponsorer`-samlingen? Samme ship-dark-form som podcast-samlingen:
 *  motoren opretter den ikke selv, og beskeden siger hvad der mangler. */
export async function kraevSponsorSamling(): Promise<StoreSvar<true>> {
  const config = await getAdminConfig();
  if (config.collections.find((c) => c.name === SPONSOR_SAMLING)) {
    return { ok: true, vaerdi: true };
  }
  return {
    ok: false,
    grund:
      `dette site har ingen «${SPONSOR_SAMLING}»-samling. ` +
      `Sponsorindslag er slået fra indtil den er erklæret i cms.config.ts — ` +
      `se docs/features/F191-sponsorindslag.md for skemaet.`,
  };
}

function laes(raa: unknown): SponsorData {
  const d = (raa ?? {}) as Record<string, unknown>;
  const tal = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    titel: typeof d.titel === "string" ? d.titel : "",
    sponsor: typeof d.sponsor === "string" ? d.sponsor : "",
    lydUrl: typeof d.lydUrl === "string" && d.lydUrl ? d.lydUrl : undefined,
    sekunder: tal(d.sekunder),
    kilde: d.kilde === "upload" || d.kilde === "tale" ? d.kilde : undefined,
    manuskript: typeof d.manuskript === "string" ? d.manuskript : undefined,
    stemme: typeof d.stemme === "string" ? d.stemme : undefined,
    brugtIAfsnit: Array.isArray(d.brugtIAfsnit) ? d.brugtIAfsnit.map(String) : [],
    aktiv: d.aktiv !== false,
  };
}

export async function hentSponsor(slug: string): Promise<StoreSvar<Sponsor | null>> {
  const klar = await kraevSponsorSamling();
  if (!klar.ok) return klar;
  const cms = await getAdminCms();
  const doc = await cms.content.findBySlug(SPONSOR_SAMLING, slug);
  return { ok: true, vaerdi: doc ? { slug, data: laes(doc.data) } : null };
}

export async function listSponsorer(): Promise<StoreSvar<Sponsor[]>> {
  const klar = await kraevSponsorSamling();
  if (!klar.ok) return klar;
  const cms = await getAdminCms();
  const { documents } = await cms.content.findMany(SPONSOR_SAMLING, {});
  return {
    ok: true,
    vaerdi: (documents as { slug?: unknown; data?: unknown }[]).map((d) => ({
      slug: String(d.slug ?? ""),
      data: laes(d.data),
    })),
  };
}

/** Skriv felter — FLETTER, som afsnittene. Et delvist skriv der erstatter hele
 *  `data` sletter tavst alt kalderen ikke huskede at sende med. */
export async function skrivSponsor(
  slug: string,
  aendringer: Partial<SponsorData>,
): Promise<StoreSvar<Sponsor>> {
  const klar = await kraevSponsorSamling();
  if (!klar.ok) return klar;
  const cms = await getAdminCms();
  const findes = await cms.content.findBySlug(SPONSOR_SAMLING, slug);

  if (!findes) {
    const nyt: SponsorData = { titel: "", sponsor: "", brugtIAfsnit: [], aktiv: true, ...aendringer };
    await cms.content.create(SPONSOR_SAMLING, { slug, status: "published", data: nyt });
    return { ok: true, vaerdi: { slug, data: nyt } };
  }
  const flettet = { ...laes(findes.data), ...aendringer };
  await cms.content.update(SPONSOR_SAMLING, slug, { data: flettet });
  return { ok: true, vaerdi: { slug, data: flettet } };
}

/**
 * Må dette indslag vælges på et afsnit?
 *
 * Server-side, fordi et indslag uden lyd ville give en sammenføjning der
 * mangler et stykke — og resultatet ville være en fil hvor Aidan siger «vi
 * tager en kort pause» og derefter ingenting.
 */
export function maaBruges(d: SponsorData): StoreSvar<true> {
  if (d.aktiv === false) return { ok: false, grund: "indslaget er sat på pause" };
  if (!d.lydUrl) return { ok: false, grund: "indslaget har ingen lyd endnu" };
  return { ok: true, vaerdi: true };
}

/**
 * Afsnittene et indslag er i brug i — sponsorens eget spørgsmål.
 *
 * Læses ud af AFSNITTENE frem for at stole på sponsorens egen liste. De to kan
 * drive fra hinanden (et afsnit slettes, et indslag byttes ud), og af de to er
 * afsnittene sandheden: det er dem der bliver afspillet.
 */
export function brugtI(sponsorSlug: string, afsnit: { slug: string; sponsorSlug?: string }[]): string[] {
  // Et TOMT navn matcher ellers hvert afsnit UDEN sponsor, fordi undefined ===
  // undefined. Fanget af prøven «et afsnit uden sponsor tælles ikke med nogen»,
  // og fejlen er ikke teoretisk: maaSlettes() ville så nægte at slette et
  // ubrugt indslag med den begrundelse at det er i brug overalt.
  if (!sponsorSlug) return [];
  return afsnit.filter((a) => a.sponsorSlug === sponsorSlug).map((a) => a.slug);
}

/**
 * Må indslaget slettes?
 *
 * Nej, hvis det er i brug — og beskeden NAVNGIVER afsnittene. En tavs sletning
 * ville efterlade afsnit der peger på ingenting, og det opdages først når
 * nogen indspiller dem igen.
 */
export function maaSlettes(sponsorSlug: string, afsnit: { slug: string; sponsorSlug?: string }[]): StoreSvar<true> {
  const brugt = brugtI(sponsorSlug, afsnit);
  if (!brugt.length) return { ok: true, vaerdi: true };
  return {
    ok: false,
    grund:
      `indslaget er i brug i ${brugt.length} afsnit: ${brugt.join(", ")}. ` +
      `Fjern det fra dem først, eller sæt det på pause i stedet for at slette det.`,
  };
}
