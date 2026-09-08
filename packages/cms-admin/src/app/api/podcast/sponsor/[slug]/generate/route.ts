/**
 * F191.5 — POST /api/podcast/sponsor/[slug]/generate · indtal et sponsorindslag.
 *
 * Den ene af arkivets to veje til lyd. Den anden — kundens egen uploadede fil —
 * går gennem det almindelige medie-upload og sætter bare `lydUrl`; den behøver
 * ingen rute her, og det er med vilje: en upload er en upload.
 *
 * KOSTER PENGE. Derfor podcast.record og ikke podcast.edit: en redaktør må
 * gerne skrive et manuskript til en reklame uden at kunne bruge penge på at
 * indtale den. Samme skel som på selve afsnittet.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { hentSponsor, skrivSponsor } from "@/lib/podcast/sponsors";
import { laengdeSek } from "@/lib/podcast/stitch";
import { getAI } from "@/lib/ai/client";
import { getMediaAdapter } from "@/lib/media";
import { sitetsUdtaler } from "@/lib/podcast/udtale";

export const OPTIONS = preflight;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.record);
  if (afvist) return afvist.svar;

  const { slug } = await params;
  const hentet = await hentSponsor(slug);
  if (!hentet.ok) return svar(req, { error: hentet.grund }, 409);
  if (!hentet.vaerdi) return svar(req, { error: `indslaget «${slug}» findes ikke` }, 404);

  const krop = (await req.json().catch(() => ({}))) as { manuskript?: unknown; stemme?: unknown };
  const manuskript =
    (typeof krop.manuskript === "string" ? krop.manuskript : hentet.vaerdi.data.manuskript) ?? "";
  const stemme = (typeof krop.stemme === "string" ? krop.stemme : hentet.vaerdi.data.stemme) ?? "";

  if (!manuskript.trim()) return svar(req, { error: "der er intet manuskript at indtale" }, 400);
  if (!stemme.trim()) {
    return svar(
      req,
      {
        error:
          "der er ingen stemme valgt. En reklame læst af en af værterne lyder " +
          "som at værten sælger noget — vælg en anden.",
      },
      400,
    );
  }

  let lyd: Uint8Array;
  try {
    const ai = await getAI();
    // voiceFallback sættes IKKE. En sponsors indslag er en identitet: falder
    // stemmen tilbage til en fremmed, har kunden betalt for én reklame og fået
    // en anden — uden at nogen får det at vide. SDK'ets egen dokumentation
    // advarer mod fallback præcis her.
    // F191.6 — sitets egen udtale-ordbog. Uden den siger speakeren sponsorens
    // navn som det staves. Sendes kun når sitet HAR en; teksten forbliver ren.
    const pronunciations = await sitetsUdtaler();
    const r = await ai.tts({
      text: manuskript,
      voice: stemme,
      purpose: "podcast.sponsor",
      ...(pronunciations ? { pronunciations } : {}),
    });
    lyd = r.audio;
  } catch (err) {
    return svar(
      req,
      { error: `indtalingen fejlede: ${err instanceof Error ? err.message : "ukendt fejl"}` },
      502,
    );
  }

  let lydUrl: string;
  try {
    const adapter = await getMediaAdapter();
    const r = await adapter.uploadFile(`sponsor-${slug}.mp3`, Buffer.from(lyd), "sponsor");
    // Adapterens URL bruges UÆNDRET — den returnerer allerede «/uploads/…».
    // Sætter man et præfiks på her, bliver den «/uploads/uploads/…» og svarer
    // 404. Målt på afsnittenes egen lyd 7/9, hvor alt andet så grønt ud.
    lydUrl = r.url;
  } catch (err) {
    return svar(
      req,
      {
        error:
          `lyden blev lavet (og betalt) men kunne ikke gemmes: ` +
          `${err instanceof Error ? err.message : "ukendt fejl"}`,
      },
      500,
    );
  }

  // Længden MÅLES på den afkodede strøm. Den skal stå i arkivet, fordi det er
  // det tal en redaktør planlægger efter — og fordi filstørrelse gange en
  // antaget bitrate er et gæt der bliver forkert på en uploadet fil.
  const sekunder = await laengdeSek(lyd);

  const skrevet = await skrivSponsor(slug, {
    lydUrl,
    kilde: "tale",
    manuskript,
    stemme,
    ...(sekunder !== null ? { sekunder: Math.round(sekunder * 10) / 10 } : {}),
  });
  if (!skrevet.ok) return svar(req, { error: skrevet.grund }, 409);

  return svar(req, { sponsor: skrevet.vaerdi, lydUrl, sekunder });
}
