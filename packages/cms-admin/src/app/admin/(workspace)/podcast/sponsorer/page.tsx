"use client";

/**
 * F191.4 · sponsor-arkivet.
 *
 * Christian, 8/9: «hvis du havde lavet det cms interface du havde lovet som en
 * del af aftalen kunne jeg jo teste reklamen for dig og lytte til den». Han har
 * ret — motoren og API'et kom først, og uden denne skærm kan ingen høre
 * resultatet. Det er skærmen der gør indslaget til noget man kan bedømme.
 *
 * KLIENT AF API'ET, ikke af motoren. Ingen import fra lib/podcast/* i denne fil,
 * af samme grund som de øvrige fire skærme: kunne cms-admin komme uden om
 * /api/podcast/*, ville site-panelet ude i kundens eget site få den utestede vej.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { Megaphone, Plus, ArrowLeft } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";

type Sponsor = {
  slug: string;
  data: {
    titel: string;
    sponsor: string;
    lydUrl?: string;
    sekunder?: number;
    kilde?: "upload" | "tale";
    manuskript?: string;
    stemme?: string;
    aktiv?: boolean;
  };
  brugtI: string[] | null;
};

/** Stemmerne SDK'et kender på dansk. Aidan bruger «jesper», så en reklame må
 *  ikke — hører man værten sælge noget, er det ikke en reklame, det er værten
 *  der bryder rollen. Det er Christians eget krav. */
const STEMMER = [
  { value: "mads", label: "Mads (mand)" },
  { value: "soren", label: "Søren (mand)" },
  { value: "noam", label: "Noam (mand)" },
  { value: "camilla", label: "Camilla (kvinde)" },
  { value: "jesper", label: "Jesper — Aidans egen, undgå til reklamer" },
];

const felt: React.CSSProperties = {
  padding: ".4rem .55rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: ".85rem",
};

function sek(n?: number): string {
  if (!n) return "—";
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s} sek`;
}

export default function SponsorArkivPage() {
  const [liste, setListe] = useState<Sponsor[]>([]);
  const [henter, setHenter] = useState(true);
  const [fejl, setFejl] = useState<string | null>(null);
  const [opretter, setOpretter] = useState(false);
  const [nySlug, setNySlug] = useState("");
  const [nyTitel, setNyTitel] = useState("");
  const [nySponsor, setNySponsor] = useState("");
  const [nyStemme, setNyStemme] = useState("mads");
  const [nyManus, setNyManus] = useState("");
  const [gemmer, setGemmer] = useState(false);
  const [indtaler, setIndtaler] = useState<string | null>(null);
  const [bekraeft, setBekraeft] = useState<string | null>(null);

  async function hent() {
    setHenter(true);
    try {
      const r = await fetch("/api/podcast/sponsor");
      const d = (await r.json()) as { sponsorer?: Sponsor[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setListe(d.sponsorer ?? []);
      setFejl(null);
    } catch (e) {
      setFejl(e instanceof Error ? e.message : "kunne ikke hente arkivet");
    } finally {
      setHenter(false);
    }
  }

  useEffect(() => {
    void hent();
  }, []);

  async function opret() {
    setGemmer(true);
    try {
      const r = await fetch("/api/podcast/sponsor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: nySlug.trim(),
          titel: nyTitel.trim(),
          sponsor: nySponsor.trim(),
          manuskript: nyManus.trim(),
          stemme: nyStemme,
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setOpretter(false);
      setNySlug("");
      setNyTitel("");
      setNySponsor("");
      setNyManus("");
      await hent();
    } catch (e) {
      setFejl(e instanceof Error ? e.message : "kunne ikke oprette");
    } finally {
      setGemmer(false);
    }
  }

  /** Indtaling KOSTER PENGE. Derfor bekræftelse først, med beløbet på knappen —
   *  samme mønster som indspilningen af et afsnit. */
  async function indtal(s: Sponsor) {
    setIndtaler(s.slug);
    setBekraeft(null);
    try {
      const r = await fetch(`/api/podcast/sponsor/${s.slug}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      await hent();
    } catch (e) {
      setFejl(e instanceof Error ? e.message : "indtalingen fejlede");
    } finally {
      setIndtaler(null);
    }
  }

  const pris = (n: number) => `$${((n / 1000) * 0.1).toFixed(2)}`;

  return (
    <>
      <ActionBar
        actions={
          <button
            type="button"
            data-testid="sponsor-nyt"
            onClick={() => setOpretter((v) => !v)}
            style={{
              display: "inline-flex", alignItems: "center", gap: ".35rem",
              padding: ".35rem .7rem", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--background)", color: "var(--foreground)",
              fontSize: ".82rem", cursor: "pointer",
            }}
          >
            <Plus size={14} /> Nyt indslag
          </button>
        }
      >
        <ActionBarBreadcrumb items={["Podcast", "Sponsorindslag"]} />
      </ActionBar>


      <div style={{ padding: "1.25rem 1.5rem", maxWidth: 980 }}>
        <p style={{ color: "var(--muted-foreground)", fontSize: ".85rem", margin: "0 0 1rem" }}>
          Et indslag kan bruges i flere afsnit. Lyden kommer enten fra en fil du uploader,
          eller ved at vi indtaler manuskriptet.
        </p>

        {fejl && (
          <div
            data-testid="sponsor-fejl"
            style={{
              padding: ".6rem .8rem", borderRadius: 6, marginBottom: "1rem",
              border: "1px solid var(--destructive)", color: "var(--destructive)",
              fontSize: ".82rem",
            }}
          >
            {fejl}
          </div>
        )}

        {opretter && (
          <div
            data-testid="sponsor-opret"
            style={{
              border: "1px solid var(--border)", borderRadius: 8, padding: "1rem",
              marginBottom: "1.25rem", display: "grid", gap: ".6rem",
            }}
          >
            <input
              data-testid="sponsor-ny-slug" style={felt} placeholder="slug — fx broberg-efteraar"
              value={nySlug} onChange={(e) => setNySlug(e.target.value)}
            />
            <input
              data-testid="sponsor-ny-titel" style={felt} placeholder="Titel — fx «Efterårskampagne, 30 sek»"
              value={nyTitel} onChange={(e) => setNyTitel(e.target.value)}
            />
            <input
              data-testid="sponsor-ny-sponsor" style={felt} placeholder="Sponsorens navn"
              value={nySponsor} onChange={(e) => setNySponsor(e.target.value)}
            />
            <textarea
              data-testid="sponsor-ny-manuskript" style={{ ...felt, minHeight: 110, resize: "vertical" }}
              placeholder="Manuskript — kun hvis vi skal indtale det. Uploader du selv en fil, kan feltet stå tomt."
              value={nyManus} onChange={(e) => setNyManus(e.target.value)}
            />
            <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
              <span style={{ fontSize: ".8rem", color: "var(--muted-foreground)" }}>Stemme</span>
              {/* CustomSelect, ikke native <select> — husets regel. Den tager
                  ikke data-testid, så ankeret sidder på indpakningen. */}
              <span data-testid="sponsor-ny-stemme">
                <CustomSelect value={nyStemme} onChange={setNyStemme} options={STEMMER} />
              </span>
              {nyManus.trim().length > 0 && (
                <span style={{ fontSize: ".78rem", color: "var(--muted-foreground)" }}>
                  {nyManus.trim().length} tegn · ca. {pris(nyManus.trim().length)} at indtale
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: ".5rem" }}>
              <button
                type="button" data-testid="sponsor-gem" disabled={gemmer || !nySlug.trim()}
                onClick={() => void opret()}
                style={{
                  padding: ".4rem .9rem", borderRadius: 6, border: "none",
                  background: "var(--primary)", color: "var(--primary-foreground)",
                  fontSize: ".82rem", cursor: gemmer ? "wait" : "pointer",
                  opacity: !nySlug.trim() ? 0.5 : 1,
                }}
              >
                {gemmer ? "Gemmer…" : "Opret"}
              </button>
              <button
                type="button" data-testid="sponsor-annuller" onClick={() => setOpretter(false)}
                style={{
                  padding: ".4rem .9rem", borderRadius: 6, border: "1px solid var(--border)",
                  background: "transparent", color: "var(--foreground)", fontSize: ".82rem",
                  cursor: "pointer",
                }}
              >
                Fortryd
              </button>
            </div>
          </div>
        )}

        {henter ? (
          <p style={{ color: "var(--muted-foreground)", fontSize: ".85rem" }}>Henter arkivet…</p>
        ) : liste.length === 0 ? (
          <div
            data-testid="sponsor-tomt"
            style={{
              border: "1px dashed var(--border)", borderRadius: 8, padding: "2rem",
              textAlign: "center", color: "var(--muted-foreground)", fontSize: ".85rem",
            }}
          >
            <Megaphone size={22} style={{ opacity: 0.5, marginBottom: ".5rem" }} />
            <p style={{ margin: 0 }}>Der er ingen sponsorindslag endnu.</p>
          </div>
        ) : (
          <div data-testid="sponsor-liste" style={{ display: "grid", gap: ".9rem" }}>
            {liste.map((s) => (
              <div
                key={s.slug}
                data-testid="sponsor-kort"
                style={{
                  border: "1px solid var(--border)", borderRadius: 8, padding: "1rem",
                  opacity: s.data.aktiv === false ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: ".95rem" }}>{s.data.titel || s.slug}</strong>
                    <div style={{ fontSize: ".8rem", color: "var(--muted-foreground)", marginTop: ".15rem" }}>
                      {s.data.sponsor || "—"}
                      {" · "}
                      {s.data.kilde === "tale" ? `indtalt (${s.data.stemme ?? "?"})` : s.data.kilde === "upload" ? "uploadet" : "ingen lyd"}
                      {" · "}
                      {sek(s.data.sekunder)}
                    </div>
                  </div>
                  <div style={{ fontSize: ".78rem", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                    {/* Sponsorens eget spørgsmål. `null` betyder at opslaget
                        fejlede — det er IKKE det samme som «ingen afsnit», og
                        må derfor ikke vises som 0. */}
                    {s.brugtI === null
                      ? "brug ukendt"
                      : s.brugtI.length === 0
                        ? "ikke i brug"
                        : `i ${s.brugtI.length} afsnit`}
                  </div>
                </div>

                {s.data.manuskript && (
                  <p style={{ fontSize: ".82rem", margin: ".7rem 0 0", lineHeight: 1.55 }}>
                    {s.data.manuskript}
                  </p>
                )}

                {s.data.lydUrl ? (
                  <audio
                    controls
                    data-testid="sponsor-afspiller"
                    src={s.data.lydUrl}
                    style={{ width: "100%", marginTop: ".8rem" }}
                  />
                ) : (
                  <div style={{ marginTop: ".8rem", display: "flex", alignItems: "center", gap: ".5rem" }}>
                    {bekraeft === s.slug ? (
                      <>
                        <span style={{ fontSize: ".78rem", color: "var(--muted-foreground)" }}>
                          Indtal for {pris((s.data.manuskript ?? "").length)}?
                        </span>
                        <button
                          type="button" data-testid="sponsor-indtal-ja"
                          onClick={() => void indtal(s)}
                          style={{
                            fontSize: ".75rem", padding: ".2rem .6rem", borderRadius: 4, border: "none",
                            background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer",
                          }}
                        >
                          Ja
                        </button>
                        <button
                          type="button" data-testid="sponsor-indtal-nej"
                          onClick={() => setBekraeft(null)}
                          style={{
                            fontSize: ".75rem", padding: ".2rem .6rem", borderRadius: 4,
                            border: "1px solid var(--border)", background: "transparent",
                            color: "var(--foreground)", cursor: "pointer",
                          }}
                        >
                          Nej
                        </button>
                      </>
                    ) : (
                      <button
                        type="button" data-testid="sponsor-indtal"
                        disabled={!s.data.manuskript || !s.data.stemme || indtaler === s.slug}
                        onClick={() => setBekraeft(s.slug)}
                        style={{
                          fontSize: ".8rem", padding: ".35rem .8rem", borderRadius: 6,
                          border: "1px solid var(--border)", background: "var(--background)",
                          color: "var(--foreground)",
                          cursor: s.data.manuskript ? "pointer" : "not-allowed",
                          opacity: s.data.manuskript ? 1 : 0.5,
                        }}
                      >
                        {indtaler === s.slug ? "Indtaler…" : "Indtal manuskriptet"}
                      </button>
                    )}
                    {!s.data.manuskript && (
                      <span style={{ fontSize: ".78rem", color: "var(--muted-foreground)" }}>
                        Upload en lydfil i Media, eller skriv et manuskript her.
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p style={{ marginTop: "1.5rem" }}>
          <Link
            href="/admin/podcast"
            data-testid="sponsor-tilbage"
            style={{
              display: "inline-flex", alignItems: "center", gap: ".3rem",
              fontSize: ".82rem", color: "var(--muted-foreground)", textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} /> Tilbage til afsnittene
          </Link>
        </p>
      </div>
    </>
  );
}
