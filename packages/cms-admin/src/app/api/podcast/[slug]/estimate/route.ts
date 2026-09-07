/**
 * F189.5 — GET /api/podcast/[slug]/estimate · prisen OG før-flyvnings-tjekket.
 *
 * Bruger INGEN penge. Det er hele meningen: et site-panel skal kunne skrive
 * beløbet på sin egen knap og vise tjeklisten, uden at nogen har trykket.
 *
 * Udtale-ordbogen sendes af KALDEREN — motoren validerer den, den ejer den
 * ikke. En CMS-evne flere sites køber sig ind på, må ikke eje ét sites udtale
 * af «harness».
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { hentAfsnit } from "@/lib/podcast/store";
import { estimat, foerFlyvning, type Udtale } from "@/lib/podcast/preflight";

export const OPTIONS = preflight;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.read);
  if (afvist) return afvist.svar;

  const { slug } = await params;
  const hentet = await hentAfsnit(slug);
  if (!hentet.ok) return svar(req, { error: hentet.grund }, 409);
  if (!hentet.vaerdi) return svar(req, { error: `afsnittet «${slug}» findes ikke` }, 404);

  const a = hentet.vaerdi.data;

  // Ordbogen kommer som en query-parameter, så estimatet kan hentes med et rent
  // GET. Kan den ikke læses, siges det — den springes ikke bare over, for et
  // tjek der stiltiende udgår ser grønt ud.
  const raa = req.nextUrl.searchParams.get("udtaler");
  let udtaler: Udtale[] | undefined;
  if (raa) {
    try {
      const p = JSON.parse(raa);
      if (!Array.isArray(p)) throw new Error("ikke en liste");
      udtaler = p as Udtale[];
    } catch (err) {
      return svar(
        req,
        { error: `«udtaler» kunne ikke læses: ${err instanceof Error ? err.message : "ukendt"}` },
        400,
      );
    }
  }

  const stemmer = a.stemmer ? [a.stemmer.aidan, a.stemmer.airina] : [];
  return svar(req, {
    estimat: estimat(a.replikker),
    foerFlyvning: foerFlyvning({
      replikker: a.replikker,
      ...(udtaler ? { udtaler } : {}),
      stemmer,
      godkendt: a.tilstand === "godkendt",
    }),
  });
}
