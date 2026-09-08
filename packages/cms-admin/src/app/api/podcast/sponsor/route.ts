/**
 * F191.1 — GET /api/podcast/sponsor · arkivet · POST opretter et indslag.
 *
 * Ligger under /api/podcast/ og ikke under /api/cms/sponsorer, fordi det er en
 * PODCAST-handling: listen bærer «hvilke afsnit er dette indslag brugt i», og
 * det svar kan kun gives af nogen der kender afsnittene. En ren
 * indholdssamling ville kunne læse dokumenterne og ikke deres brug.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { listSponsorer, skrivSponsor, hentSponsor, brugtI } from "@/lib/podcast/sponsors";
import { listAfsnit } from "@/lib/podcast/store";
import { estimatForTekst } from "@/lib/podcast/preflight";

export const OPTIONS = preflight;

/** Samme snævre form som afsnittenes slug — små bogstaver, tal, bindestreger. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(req: NextRequest) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.read);
  if (afvist) return afvist.svar;

  const liste = await listSponsorer();
  if (!liste.ok) return svar(req, { error: liste.grund }, 409);

  // BRUGEN LÆSES UD AF AFSNITTENE. Sponsorens eget felt kunne være forældet;
  // afsnittene er dem der bliver afspillet, så de er sandheden. Fejler
  // opslaget, siges det frem for at svare med en tom liste der ligner «ingen».
  const afsnit = await listAfsnit();
  const brug = afsnit.ok
    ? afsnit.vaerdi.map((a) => ({ slug: a.slug, sponsorSlug: a.data.sponsorSlug }))
    : null;

  return svar(req, {
    sponsorer: liste.vaerdi.map((s) => {
      // Prisen regnes i MOTOREN og sendes med. Skærmen skal ikke kende hverken
      // satsen eller valutakursen — gjorde den det, ville der være to
      // sandheder om hvad et tryk koster.
      const e = estimatForTekst(s.data.manuskript ?? "");
      return {
        ...s,
        brugtI: brug ? brugtI(s.slug, brug) : null,
        prisUsd: e.prisUsd,
        prisDkk: e.prisDkk,
        kursMaalt: e.kursMaalt,
      };
    }),
    ...(brug ? {} : { advarsel: `brugen kunne ikke slås op: ${afsnit.ok ? "" : afsnit.grund}` }),
  });
}

export async function POST(req: NextRequest) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.edit);
  if (afvist) return afvist.svar;

  const krop = (await req.json().catch(() => null)) as {
    slug?: unknown;
    titel?: unknown;
    sponsor?: unknown;
    manuskript?: unknown;
    stemme?: unknown;
  } | null;

  const slug = typeof krop?.slug === "string" ? krop.slug.trim() : "";
  if (!SLUG.test(slug)) {
    return svar(req, { error: "«slug» skal være små bogstaver, tal og bindestreger — fx «broberg-efteraar»" }, 400);
  }

  const findes = await hentSponsor(slug);
  if (!findes.ok) return svar(req, { error: findes.grund }, 409);
  if (findes.vaerdi) return svar(req, { error: `indslaget «${slug}» findes allerede` }, 409);

  const skrevet = await skrivSponsor(slug, {
    titel: typeof krop?.titel === "string" ? krop.titel : "",
    sponsor: typeof krop?.sponsor === "string" ? krop.sponsor : "",
    ...(typeof krop?.manuskript === "string" ? { manuskript: krop.manuskript } : {}),
    ...(typeof krop?.stemme === "string" ? { stemme: krop.stemme } : {}),
    aktiv: true,
  });
  if (!skrevet.ok) return svar(req, { error: skrevet.grund }, 409);
  return svar(req, { sponsor: skrevet.vaerdi }, 201);
}
