/**
 * F191.6 — GET/PUT /api/podcast/udtale · sitets egen udtale-ordbog.
 *
 * Ligger under /api/podcast/ og ikke i de almindelige site-indstillinger, af
 * samme grund som sponsor-arkivet: det er en PODCAST-handling, og det er dér
 * redaktøren står når han hører et ord blive sagt galt. En indstillingsside
 * han skal lede efter, er en ordbog der ikke bliver vedligeholdt.
 *
 * SKRIVNING kræver podcast.edit — at rette en udtale er redigering, ikke et
 * pengeforbrug. Selve indspilningen (podcast.record) er stadig sin egen.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { readSiteConfig, writeSiteConfig } from "@/lib/site-config";
import { tilElevenLabs, type UdtaleRaekke } from "@/lib/podcast/udtale";

export const OPTIONS = preflight;

/** Et ord og en lydskrift er korte. Loftet findes for at et fejlindsat
 *  dokument ikke ender som en «ordbog» på et halvt manuskript. */
const MAKS_LAENGDE = 200;
const MAKS_RAEKKER = 500;

export async function GET(req: NextRequest) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.read);
  if (afvist) return afvist.svar;

  const cfg = await readSiteConfig();
  const raekker = Array.isArray(cfg.podcastUdtaler) ? cfg.podcastUdtaler : [];
  return svar(req, {
    udtaler: raekker,
    // Hvad der FAKTISK ville blive sendt. Forskellen mellem de to lister er
    // svaret på «hvorfor virkede min række ikke» — uden den ville en IPA-række
    // se gemt ud og aldrig blive brugt.
    sendes: tilElevenLabs(raekker),
  });
}

export async function PUT(req: NextRequest) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.edit);
  if (afvist) return afvist.svar;

  const krop = (await req.json().catch(() => null)) as { udtaler?: unknown } | null;
  if (!Array.isArray(krop?.udtaler)) {
    return svar(req, { error: "«udtaler» skal være en liste" }, 400);
  }
  if (krop.udtaler.length > MAKS_RAEKKER) {
    return svar(req, { error: `højst ${MAKS_RAEKKER} rækker` }, 400);
  }

  const rene: UdtaleRaekke[] = [];
  for (const raa of krop.udtaler as unknown[]) {
    const r = raa as { word?: unknown; alias?: unknown; ipa?: unknown };
    const word = typeof r.word === "string" ? r.word.trim() : "";
    const alias = typeof r.alias === "string" ? r.alias.trim() : "";
    const ipa = typeof r.ipa === "string" ? r.ipa.trim() : "";
    if (!word) return svar(req, { error: "hver række skal have et ord" }, 400);
    if (!alias && !ipa) {
      return svar(
        req,
        { error: `«${word}» har ingen lydskrift — så er der intet at rette udtalen med` },
        400,
      );
    }
    if (word.length > MAKS_LAENGDE || alias.length > MAKS_LAENGDE || ipa.length > MAKS_LAENGDE) {
      return svar(req, { error: `«${word}» er for lang (højst ${MAKS_LAENGDE} tegn)` }, 400);
    }
    rene.push({ word, ...(alias ? { alias } : {}), ...(ipa ? { ipa } : {}) });
  }

  const gemt = await writeSiteConfig({ podcastUdtaler: rene });
  // Svarer med det der STÅR i konfigurationen efter skrivningen, ikke med det
  // der blev sendt ind. Klienten kan så vise det gemte frem for sin egen
  // hensigt — husets regel om at et gem-felt skal bevises at have gemt.
  return svar(req, { udtaler: gemt.podcastUdtaler, sendes: tilElevenLabs(gemt.podcastUdtaler) });
}
