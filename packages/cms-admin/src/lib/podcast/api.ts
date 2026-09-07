/**
 * F189.5 — den fælles halvdel af `/api/podcast/*`: hvem må, hvorfra, og hvad.
 *
 * ÉT sted, ikke pr. rute. Et permission-tjek der er kopieret ind i seks
 * handlere er seks steder nogen kan glemme det, og den der bliver glemt er den
 * der bliver brugt. Husets egen regel siger det for hvert nyt endpoint: svar på
 * «admin eller også redaktør?» og skriv svaret ind i permission-systemet på
 * ALLE lag.
 *
 * AUTH — RETTET EFTER EJERENS BESKED 7/9: «Mobil appen er ikke i spil her den
 * virker ikke.»
 *
 * Planen brugte først /api/mobile/* som BEVIS for at formen virker. Den
 * begrundelse er trukket tilbage — en flade der ikke virker beviser ingenting.
 * Mekanikken står på et andet grundlag: `verifyToken` i lib/auth.ts er den
 * SAMME funktion det almindelige admin-login bruger (/api/auth/login,
 * /api/auth/me, proxy'ens egen verifikation). Det virker hver dag, for hver
 * redaktør. Mobil-ruterne er blot endnu en forbruger.
 *
 * Konsekvensen er praktisk: hele token-vejen for et site-panel skal BEVISES i
 * F189.7 med et rigtigt kald udefra — ikke krydses af på en henvisning.
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifyToken, type SessionPayload } from "@/lib/auth";
import { resolveMembershipRole } from "@/lib/require-role";
import { getTeamMembers } from "@/lib/team";
import { hasPermission, ROLE_PERMISSIONS } from "@/lib/permissions";
import { readSiteConfig } from "@/lib/site-config";
import { originAllowed, siteOriginsWithSiblings } from "@/lib/cors-origin";

/**
 * Podcastens egne tilladelser.
 *
 * TRE og ikke én, fordi de tre handlinger har vidt forskellig vægt:
 *   podcast.read     se afsnit og manuskripter
 *   podcast.edit     skrive og godkende manuskripter
 *   podcast.record   BRUGE PENGE
 *
 * Den sidste er sin egen med vilje. En redaktør der må rette en tekst, er ikke
 * automatisk en der må bruge $1,48 af ejerens penge pr. tryk — og hvis de to
 * var samme tilladelse, kunne forskellen ikke udtrykkes.
 */
export const PODCAST_PERMISSIONS = {
  read: "podcast.read",
  edit: "podcast.edit",
  record: "podcast.record",
} as const;

export type PodcastPermission = (typeof PODCAST_PERMISSIONS)[keyof typeof PODCAST_PERMISSIONS];

/** Hvem kalder? Cookie ELLER Bearer — samme verifikation for begge. */
export async function laesKalder(req: NextRequest): Promise<SessionPayload | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const p = await verifyToken(auth.slice(7).trim());
    if (p) return p;
  }
  // Cookie-vejen: proxy har allerede verificeret den for /api/*, men vi læser
  // den igen her frem for at stole på at den nåede frem — samme funktion,
  // samme svar, ingen anden sti.
  const cookie = req.cookies.get("cms-session")?.value;
  if (cookie) return verifyToken(cookie);
  return null;
}

export type Afvisning = { svar: NextResponse };

/**
 * Må denne kalder gøre dette?
 *
 * Returnerer `null` når ja. En afvisning er et færdigt svar, så kaldstedet
 * læser som `if (afvist) return afvist.svar;` — og ikke som fire linjer hvor
 * den tredje kan glemmes.
 */
export async function kraevTilladelse(
  req: NextRequest,
  tilladelse: PodcastPermission,
): Promise<Afvisning | null> {
  const kalder = await laesKalder(req);
  if (!kalder) {
    return { svar: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // En read-only Lens-session må se, ikke skrive — samme grænse som proxy'ens,
  // her hvor den også gælder for et Bearer-kald der ikke går gennem den.
  const lensReadOnly = kalder.lens === true && kalder.lensWrite !== true;
  if (lensReadOnly && tilladelse !== PODCAST_PERMISSIONS.read) {
    return {
      svar: NextResponse.json({ error: "Lens session is read-only" }, { status: 403 }),
    };
  }

  // ROLLEN OPSLÅS PÅ DEN KALDER VI ALLEREDE LÆSTE — ikke via getSiteRole(),
  // som henter sessionen ud af COOKIES igen.
  //
  // Målt 7/9: et Bearer-kald uden cookies fik 403 «missing permission
  // podcast.read» selv som admin. laesKalder() havde læst tokenet korrekt;
  // getSiteRole() kiggede bagefter i en tom cookie-krukke og svarede null. To
  // identitetskilder i ét tjek, hvor den anden ikke kunne se den første — og
  // en flade der SKAL kunne bruges uden cookies var dermed låst ude af sit
  // eget permission-tjek.
  //
  // resolveMembershipRole er husets delte svar (eksporteret netop fordi tre
  // sider hånd-rullede det og hver kun kendte «dev-token»). Den håndterer både
  // de selvbeskrivende principaler og den almindelige medlemsopslag.
  const rolle = resolveMembershipRole(kalder, await getTeamMembers()) as
    | keyof typeof ROLE_PERMISSIONS
    | null;
  if (!rolle || !hasPermission(ROLE_PERMISSIONS[rolle] ?? [], tilladelse)) {
    return {
      svar: NextResponse.json(
        { error: "Forbidden", reason: `missing permission ${tilladelse}`, permission: tilladelse },
        { status: 403 },
      ),
    };
  }
  return null;
}

/**
 * CORS mod sitets EGNE adresser.
 *
 * Genbruger `siteOriginsWithSiblings` frem for at læse previewSiteUrl alene.
 * Grunden står i forms-ruten, betalt for på sanneandersens lanceringsdag: et
 * site der flyttede til sit rigtige domæne fik hver indsendelse afvist —
 * tavst, fordi en formular der holder op med at virke ikke melder noget.
 */
export async function tilladteOrigins(): Promise<string[]> {
  const origins: string[] = [];
  try {
    origins.push(...siteOriginsWithSiblings(await readSiteConfig()));
  } catch {
    /* intet site-config */
  }
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000", "http://localhost:3009", "https://localhost:3010");
  }
  return origins;
}

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
  if (originAllowed(origin, allowed)) headers["Access-Control-Allow-Origin"] = origin!;
  return headers;
}

/** Fælles preflight. Hver rute eksporterer denne — ellers svarer den 405. */
export async function preflight(req: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin"), await tilladteOrigins()),
  });
}

/** Et svar med CORS på. Bruges af hver rute, så headeren ikke kan glemmes ét sted. */
export async function svar(
  req: NextRequest,
  krop: unknown,
  status = 200,
): Promise<NextResponse> {
  return NextResponse.json(krop, {
    status,
    headers: corsHeaders(req.headers.get("origin"), await tilladteOrigins()),
  });
}
