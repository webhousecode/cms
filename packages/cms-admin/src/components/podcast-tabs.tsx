"use client";

/**
 * F191.8 — fane-skallen for podcast-modulet.
 *
 * Christian, 8/9: «Det Podcast modul åbner faner som andre skifter undertøj […]
 * Kan du ikke lave et modul som Agents hvor du har 3 eller flere faner til de
 * forskellige elementer og flow af en Podcast - jeg famler rundt i det».
 *
 * Fanevalget står i URL'en (?fane=), ikke i localStorage som Agents. To grunde,
 * og begge er praktiske frem for principielle:
 *
 *  1. De gamle ruter (/admin/podcast/sponsorer, /admin/podcast/udtale) skal
 *     kunne redirecte til en BESTEMT fane. localStorage kan kun sende til
 *     «hvad end du så sidst».
 *  2. Workspace-fanebladene gemmer hele stien inkl. query, så to åbne faneblade
 *     kan stå på hver sin podcast-fane. Én global localStorage-nøgle ville
 *     trække dem mod den samme værdi.
 *
 * `router.replace` og ikke `push`: et faneskift er ikke et sted man vil kunne
 * gå «tilbage» til én ad gangen.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Mic, Megaphone, Volume2 } from "lucide-react";
import { AfsnitFane } from "@/components/podcast/afsnit-fane";
import { ReklamerFane } from "@/components/podcast/reklamer-fane";
import { UdtaleFane } from "@/components/podcast/udtale-fane";

export const FANER = ["afsnit", "reklamer", "udtale"] as const;
export type FaneId = (typeof FANER)[number];

const ETIKET: { id: FaneId; tekst: string; ikon: React.ReactNode }[] = [
  { id: "afsnit", tekst: "Afsnit", ikon: <Mic size={13} /> },
  { id: "reklamer", tekst: "Reklamer", ikon: <Megaphone size={13} /> },
  { id: "udtale", tekst: "Udtale", ikon: <Volume2 size={13} /> },
];

/** En ukendt ?fane= er ikke en fejl værd at vise — den lander på den første. */
export function laesFane(vaerdi: string | null | undefined): FaneId {
  return (FANER as readonly string[]).includes(vaerdi ?? "") ? (vaerdi as FaneId) : "afsnit";
}

export function PodcastTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const fane = laesFane(params?.get("fane"));

  function skift(id: FaneId) {
    router.replace(id === "afsnit" ? "/admin/podcast" : `/admin/podcast?fane=${id}`);
  }

  return (
    <div data-testid="podcast-faner">
      <div className="flex gap-1 mb-6 border-b border-border">
        {ETIKET.map((f) => (
          <button
            key={f.id}
            type="button"
            data-testid={`podcast-fane-${f.id}`}
            aria-current={fane === f.id ? "page" : undefined}
            onClick={() => skift(f.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px transition-colors inline-flex items-center gap-1.5 ${
              fane === f.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.ikon}
            {f.tekst}
          </button>
        ))}
      </div>

      {/* Kun den valgte fane monteres. De to andre henter derfor heller ikke
          deres data — tre skærmes API-kald ved hvert sidevisning ville være
          prisen for at spare et klik. */}
      {fane === "afsnit" && <AfsnitFane />}
      {fane === "reklamer" && <ReklamerFane />}
      {fane === "udtale" && <UdtaleFane />}
    </div>
  );
}
