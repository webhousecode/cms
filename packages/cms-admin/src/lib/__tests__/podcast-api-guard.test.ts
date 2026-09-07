/**
 * F189.5 — vagten der betaler for at podcast-API'et står i proxy'ens
 * PUBLIC_PREFIXES.
 *
 * Proxy'en tjekker ikke længere en cookie for disse ruter, fordi et site med
 * sit eget login skal kunne kalde dem med et Bearer-token. Det flytter hele
 * grænsen ind i handlerne — og en grænse der ligger seks steder er seks steder
 * nogen kan glemme den. Den der bliver glemt er den der bliver brugt.
 *
 * Derfor LÆSER denne prøve rutefilerne. Den tjekker ikke at koden er skrevet
 * rigtigt i dag; den fejler den dag nogen tilføjer en syvende rute uden tjek.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isPodcastApi } from "@/proxy";

// src/lib/__tests__ → ../../.. er pakkeroden. («../..» giver src/ — målt, og
// det fejlede før nogen assertion overhovedet kørte.)
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const PODCAST_DIR = join(PKG_ROOT, "src/app/api/podcast");

function ruteFiler(dir: string): string[] {
  const ud: string[] = [];
  for (const navn of readdirSync(dir)) {
    const sti = join(dir, navn);
    if (statSync(sti).isDirectory()) ud.push(...ruteFiler(sti));
    else if (navn === "route.ts") ud.push(sti);
  }
  return ud;
}

/** Hver eksporteret HTTP-handler i filen, med sin krop. */
function handlere(kilde: string): { navn: string; krop: string }[] {
  const dele = kilde.split(/export async function /g).slice(1);
  return dele.map((d) => ({
    navn: (d.match(/^([A-Z]+)/)?.[1] ?? "?"),
    krop: d,
  }));
}

describe("F189.5 — podcast-API'ets egen auth-grænse", () => {
  const filer = ruteFiler(PODCAST_DIR);

  it("finder rutefilerne (ellers måler resten ingenting)", () => {
    // Uden denne ville en tom liste få hele suiten til at bestå grønt på nul
    // ruter — den slags grønne svar på et smallere spørgsmål er præcis det
    // denne fil findes for.
    expect(filer.length).toBeGreaterThanOrEqual(6);
  });

  for (const fil of filer) {
    const kort = relative(PKG_ROOT, fil);
    const kilde = readFileSync(fil, "utf8");

    for (const h of handlere(kilde)) {
      if (h.navn === "OPTIONS") continue; // preflight svarer 204 uden data

      it(`${kort} · ${h.navn} går gennem kraevTilladelse`, () => {
        expect(h.krop).toContain("kraevTilladelse");
      });

      it(`${kort} · ${h.navn} returnerer afvisningen (tjekket må ikke kun kaldes)`, () => {
        // Et `await kraevTilladelse(...)` hvis svar ikke returneres, er værre
        // end intet tjek: det ser ud som om grænsen er der.
        expect(h.krop).toMatch(/if \(\w+\) return \w+\.svar;/);
      });
    }
  }
});

describe("isPodcastApi — matcheren proxy'en åbner på", () => {
  it("rammer listeruten uden skråstreg", () => {
    expect(isPodcastApi("/api/podcast")).toBe(true);
  });

  it("rammer ruterne under den", () => {
    expect(isPodcastApi("/api/podcast/mit-afsnit")).toBe(true);
    expect(isPodcastApi("/api/podcast/mit-afsnit/record")).toBe(true);
  });

  it("rammer IKKE en sti der blot begynder med samme bogstaver", () => {
    // «/api/podcast» som streng i PUBLIC_PREFIXES ville have åbnet denne.
    expect(isPodcastApi("/api/podcastfoo")).toBe(false);
    expect(isPodcastApi("/api/podcasts")).toBe(false);
  });

  it("rammer ikke andre API'er", () => {
    expect(isPodcastApi("/api/cms/posts/x")).toBe(false);
    expect(isPodcastApi("/api/admin/site-config")).toBe(false);
  });
});
