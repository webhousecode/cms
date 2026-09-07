/**
 * F189.2 — I/O-halvdelen: hent artiklen, spørg modellen, skriv manuskriptet.
 *
 * Al validering ligger i manuscript.ts og prøves uden netværk. Her er kun
 * rækkefølgen — og den ene regel der ikke kan ligge i en ren funktion: et
 * afvist svar må ikke røre dokumentet.
 */
import { getAdminCms } from "@/lib/cms";
import { getAI, mistralModel } from "@/lib/ai/client";
import { getModel } from "@/lib/ai/model-resolver";
import { readSiteConfig } from "@/lib/site-config";
import {
  byggManuskriptPrompt,
  parseManuskript,
  RESERVE_TEKSTER,
  type PromptTekster,
  type Replik,
} from "./manuscript";
import { efterManuskriptRettelse } from "./state";
import { hentAfsnit, skrivAfsnit, type Afsnit, type StoreSvar } from "./store";

/**
 * Rollerne bor i CMS'et, ikke i koden — så de kan justeres uden en udrulning.
 * Reserveteksten er en NØDBREMSE: findes feltet ikke, skal generering stadig
 * virke frem for at fejle på en manglende streng.
 */
export async function hentPromptTekster(): Promise<PromptTekster> {
  const cfg = (await readSiteConfig().catch(() => ({}))) as Record<string, unknown>;
  const s = (k: string, reserve: string) =>
    typeof cfg[k] === "string" && (cfg[k] as string).trim() ? (cfg[k] as string) : reserve;
  return {
    aidanRolle: s("podcastAidanRolle", RESERVE_TEKSTER.aidanRolle),
    airinaRolle: s("podcastAirinaRolle", RESERVE_TEKSTER.airinaRolle),
    stil: s("podcastStil", RESERVE_TEKSTER.stil),
  };
}

/** Artiklens tekst, som den skal se ud for modellen. Eksporteret til prøven:
 *  markup-strippet er en vagt, ikke pynt — modellen skal læse indholdet, ikke
 *  vores HTML, og en <p> der slipper igennem bliver læst højt. */
export function artikelTekst(data: Record<string, unknown>): string {
  const felter = ["lead", "excerpt", "content", "body"];
  const dele = felter
    .map((f) => (typeof data[f] === "string" ? (data[f] as string) : ""))
    .filter(Boolean);
  // Fjern markup: modellen skal læse indholdet, ikke vores HTML.
  return dele.join("\n\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export type GenererSvar = StoreSvar<{ afsnit: Afsnit; replikker: Replik[] }>;

/**
 * Skriv (eller genskriv) manuskriptet til ét afsnit ud fra en artikel.
 *
 * REKKEFØLGEN ER SELVE KORTET:
 *   1. må vi overhovedet skrive her?   ← en godkendelse skal trækkes tilbage FØRST
 *   2. hent artiklen
 *   3. spørg modellen
 *   4. VALIDÉR — og stop her hvis svaret ikke holder
 *   5. først NU røres dokumentet
 *
 * Trin 4 før trin 5 er hele pointen: halvt skrevet ser ud som om der er noget.
 */
export async function genererManuskript(args: {
  afsnitSlug: string;
  artikelSamling: string;
  artikelSlug: string;
}): Promise<GenererSvar> {
  // 1. Er afsnittet i en tilstand hvor manuskriptet må skrives om?
  const eksisterende = await hentAfsnit(args.afsnitSlug);
  if (!eksisterende.ok) return eksisterende;

  const nuvaerende = eksisterende.vaerdi;
  if (nuvaerende && nuvaerende.data.tilstand !== "kladde") {
    // En genskrivning ER en rettelse. Er afsnittet godkendt eller indspillet,
    // skal godkendelsen trækkes tilbage først — som en eksplicit handling et
    // menneske tager, ikke som en bivirkning af at trykke «generér».
    const efter = efterManuskriptRettelse(nuvaerende.data.tilstand);
    if (nuvaerende.data.tilstand === "godkendt" || nuvaerende.data.tilstand === "indspillet" || nuvaerende.data.tilstand === "udgivet") {
      return {
        ok: false,
        grund:
          `afsnittet står som «${nuvaerende.data.tilstand}» — træk godkendelsen tilbage først ` +
          `(sæt tilstanden til «${efter}»). En genskrivning uden det ville lave teksten om ` +
          `under en godkendelse der stadig stod ved magt.`,
      };
    }
  }

  // 2. Artiklen.
  const cms = await getAdminCms();
  const artikel = await cms.content.findBySlug(args.artikelSamling, args.artikelSlug);
  if (!artikel) {
    return { ok: false, grund: `artiklen «${args.artikelSamling}/${args.artikelSlug}» findes ikke` };
  }
  const data = (artikel.data ?? {}) as Record<string, unknown>;
  const titel = typeof data.title === "string" ? data.title.replace(/<[^>]+>/g, "") : args.artikelSlug;
  const tekst = artikelTekst(data);
  if (tekst.length < 200) {
    return {
      ok: false,
      grund: `artiklen har kun ${tekst.length} tegn brødtekst — for lidt til et afsnit`,
    };
  }

  // 3. Modellen. Gennem @broberg/ai-sdk, så omkostningen spores.
  const { system, user } = byggManuskriptPrompt({
    artikelTitel: titel,
    artikelTekst: tekst,
    tekster: await hentPromptTekster(),
  });

  let raa: string;
  try {
    const model = await getModel("content");
    const ai = await getAI();
    const svar = await ai.chat({
      ...mistralModel(model),
      maxTokens: 8192,
      system,
      messages: [{ role: "user", content: user }],
      purpose: "podcast.manuscript",
    });
    raa = svar.text;
  } catch (err) {
    return {
      ok: false,
      grund: `modellen svarede ikke: ${err instanceof Error ? err.message : "ukendt fejl"}`,
    };
  }

  // 4. VALIDÉR. Herfra og opad er dokumentet urørt.
  const parset = parseManuskript(raa);
  if (!parset.ok) {
    return { ok: false, grund: `manuskriptet blev afvist: ${parset.grund}` };
  }

  // 5. Først nu skrives der.
  const skrevet = await skrivAfsnit(args.afsnitSlug, {
    titel: titel,
    artikelSlug: args.artikelSlug,
    replikker: parset.replikker,
    tilstand: "manuskript-klar",
  });
  if (!skrevet.ok) return skrevet;

  return { ok: true, vaerdi: { afsnit: skrevet.vaerdi, replikker: parset.replikker } };
}
