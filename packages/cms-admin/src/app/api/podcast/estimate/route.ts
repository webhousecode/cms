/**
 * F189.3 — POST /api/podcast/estimate · hvad ville dette manuskript koste?
 *
 * Findes fordi en skærm der REGNER prisen selv er en anden sandhed end
 * motorens. Sponsor-skærmen havde `(n / 1000) * 0.1` skrevet ind i sig — en
 * kopi af satsen — og da kronerne skulle ind, ville den have haft en kopi af
 * valutakursen også. To tal om hvad et tryk koster, hvor det ene bliver glemt
 * næste gang det andet rettes.
 *
 * Ruten koster INGENTING at kalde: den bruger ingen udbyder og ingen penge.
 * Det er hele meningen — man skal kunne vise beløbet mens der skrives.
 *
 * podcast.read og ikke podcast.edit: at se hvad noget ville koste er ikke at
 * ændre noget.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { estimatForTekst } from "@/lib/podcast/preflight";
import { hentKurs } from "@/lib/podcast/valutakurs";

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.read);
  if (afvist) return afvist.svar;

  const krop = (await req.json().catch(() => null)) as { tekst?: unknown } | null;
  const tekst = typeof krop?.tekst === "string" ? krop.tekst : "";
  // Tom tekst er ikke en fejl — det er hvad et tomt felt indeholder, og en
  // skærm der spørger mens brugeren skriver, spørger også før hun har skrevet.
  return svar(req, { estimat: estimatForTekst(tekst, await hentKurs()) });
}
