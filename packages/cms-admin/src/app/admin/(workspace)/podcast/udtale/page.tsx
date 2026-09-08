"use client";

/**
 * F191.6 · udtale-ordbogen.
 *
 * Christian, 8/9: «Et ord mere til listen der skal kunne udtales på engelsk:
 * Plugins». Han gik ud fra at listen fandtes et sted han kunne skrive i. Det
 * gjorde den ikke — den lå i kode i et andet repo. Her er den.
 *
 * ORDBOGEN ER SITETS, ikke motorens. Derfor står der ikke ét konkret ord i
 * denne fil: rækkerne kommer fra sitets egen konfiguration, og et andet site
 * har sine egne. Se lib/podcast/udtale.ts.
 *
 * KLIENT AF API'ET. Ingen import fra lib/podcast/* — samme grænse som de andre
 * podcast-skærme, så et site-panel udenfor får den samme, testede vej.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { Plus, ArrowLeft, Volume2 } from "lucide-react";

type Raekke = { word: string; alias?: string; ipa?: string };

const felt: React.CSSProperties = {
  padding: ".4rem .55rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: ".85rem",
};

export default function UdtalePage() {
  const [raekker, setRaekker] = useState<Raekke[]>([]);
  const [sendes, setSendes] = useState<{ word: string; alias: string }[]>([]);
  const [henter, setHenter] = useState(true);
  const [fejl, setFejl] = useState<string | null>(null);
  const [kvittering, setKvittering] = useState<string | null>(null);
  const [gemmer, setGemmer] = useState(false);
  const [nytOrd, setNytOrd] = useState("");
  const [nyLyd, setNyLyd] = useState("");
  const [bekraeft, setBekraeft] = useState<string | null>(null);

  async function hent() {
    setHenter(true);
    try {
      const r = await fetch("/api/podcast/udtale");
      const j = (await r.json()) as { udtaler?: Raekke[]; sendes?: { word: string; alias: string }[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setRaekker(j.udtaler ?? []);
      setSendes(j.sendes ?? []);
      setFejl(null);
    } catch (e) {
      setFejl(e instanceof Error ? e.message : "kunne ikke hente ordbogen");
    } finally {
      setHenter(false);
    }
  }

  useEffect(() => { void hent(); }, []);

  /** Gemmer og LÆSER TILBAGE. Svaret er hvad der står i konfigurationen efter
   *  skrivningen — ikke hvad vi sendte — så listen på skærmen ikke kan vise en
   *  række der aldrig blev gemt. */
  async function gem(naeste: Raekke[], besked: string) {
    setGemmer(true);
    setFejl(null);
    setKvittering(null);
    try {
      const r = await fetch("/api/podcast/udtale", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ udtaler: naeste }),
      });
      const j = (await r.json()) as { udtaler?: Raekke[]; sendes?: { word: string; alias: string }[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setRaekker(j.udtaler ?? []);
      setSendes(j.sendes ?? []);
      setKvittering(besked);
    } catch (e) {
      setFejl(e instanceof Error ? e.message : "kunne ikke gemme");
    } finally {
      setGemmer(false);
    }
  }

  async function tilfoej() {
    const word = nytOrd.trim();
    const alias = nyLyd.trim();
    if (!word || !alias) {
      setFejl("både ordet og lydskriften skal udfyldes");
      return;
    }
    // Samme ord to gange ville give to regler der kæmper om samme tekst.
    const uden = raekker.filter((r) => r.word.toLowerCase() !== word.toLowerCase());
    await gem([...uden, { word, alias }], `«${word}» siges nu «${alias}»`);
    setNytOrd("");
    setNyLyd("");
  }

  async function fjern(word: string) {
    setBekraeft(null);
    await gem(raekker.filter((r) => r.word !== word), `«${word}» er fjernet`);
  }

  return (
    <>
      <ActionBar
        actions={
          <Link
            href="/admin/podcast"
            data-testid="udtale-tilbage"
            style={{
              display: "inline-flex", alignItems: "center", gap: ".35rem",
              padding: ".35rem .7rem", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--background)", color: "var(--foreground)",
              fontSize: ".82rem", textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} /> Podcast
          </Link>
        }
      >
        <ActionBarBreadcrumb items={["Podcast", "Udtale"]} />
      </ActionBar>

      <div style={{ padding: "1.25rem 1.5rem", maxWidth: 860 }} data-testid="udtale-root">
        <p style={{ color: "var(--muted-foreground)", fontSize: ".85rem", margin: "0 0 1rem", lineHeight: 1.55 }}>
          Ord stemmerne siger galt, skrevet som de skal <em>lyde</em>. Teksten i manuskriptet
          ændres ikke — kun udtalen. Hører du et nyt ord blive sagt forkert, er én række her
          hele rettelsen.
        </p>

        {fejl && (
          <div
            data-testid="udtale-fejl"
            style={{
              padding: ".6rem .8rem", borderRadius: 6, marginBottom: "1rem",
              border: "1px solid var(--destructive)", color: "var(--destructive)",
              fontSize: ".82rem",
            }}
          >
            {fejl}
          </div>
        )}
        {kvittering && (
          <div
            data-testid="udtale-kvittering"
            style={{
              padding: ".6rem .8rem", borderRadius: 6, marginBottom: "1rem",
              border: "1px solid var(--border)", background: "var(--muted)",
              fontSize: ".82rem",
            }}
          >
            {kvittering}
          </div>
        )}

        <div
          style={{
            display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap",
            padding: ".8rem", borderRadius: 8, border: "1px solid var(--border)",
            marginBottom: "1.25rem",
          }}
        >
          <input
            data-testid="udtale-nyt-ord"
            value={nytOrd}
            onChange={(e) => setNytOrd(e.target.value)}
            placeholder="Ordet, som det staves"
            style={{ ...felt, flex: "1 1 200px" }}
          />
          <span style={{ color: "var(--muted-foreground)", fontSize: ".85rem" }}>siges</span>
          <input
            data-testid="udtale-ny-lyd"
            value={nyLyd}
            onChange={(e) => setNyLyd(e.target.value)}
            placeholder="…som det skal lyde"
            style={{ ...felt, flex: "1 1 200px" }}
          />
          <button
            type="button"
            data-testid="udtale-tilfoej"
            disabled={gemmer}
            onClick={() => void tilfoej()}
            style={{
              display: "inline-flex", alignItems: "center", gap: ".35rem",
              padding: ".4rem .8rem", borderRadius: 6, border: "none",
              background: "var(--primary)", color: "var(--primary-foreground)",
              fontSize: ".82rem", cursor: gemmer ? "wait" : "pointer", opacity: gemmer ? 0.6 : 1,
            }}
          >
            <Plus size={14} /> {gemmer ? "Gemmer…" : "Tilføj"}
          </button>
        </div>

        {henter ? (
          <p style={{ color: "var(--muted-foreground)", fontSize: ".85rem" }}>Henter…</p>
        ) : raekker.length === 0 ? (
          <p data-testid="udtale-tom" style={{ color: "var(--muted-foreground)", fontSize: ".85rem" }}>
            Ordbogen er tom. Stemmerne udtaler alt som det staves.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted-foreground)" }}>
                <th style={{ padding: ".4rem .5rem", fontWeight: 500 }}>Ord</th>
                <th style={{ padding: ".4rem .5rem", fontWeight: 500 }}>Siges</th>
                <th style={{ padding: ".4rem .5rem", fontWeight: 500, width: 140 }} />
              </tr>
            </thead>
            <tbody>
              {raekker.map((r) => {
                const bruges = sendes.some((s) => s.word === r.word);
                return (
                  <tr key={r.word} data-testid={`udtale-raekke-${r.word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                      style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: ".5rem" }}>
                      <code>{r.word}</code>
                    </td>
                    <td style={{ padding: ".5rem", color: bruges ? "var(--foreground)" : "var(--muted-foreground)" }}>
                      {r.alias ?? r.ipa}
                      {!bruges && (
                        // En IPA-række GEMMES, men ElevenLabs kan ikke bruge den.
                        // Uden denne linje ville den se aktiv ud for evigt.
                        <span style={{ marginLeft: ".5rem", fontSize: ".72rem" }}>
                          (lydskrift mangler — sendes ikke)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: ".5rem", textAlign: "right" }}>
                      {bekraeft === r.word ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: ".3rem" }}>
                          <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Fjern?</span>
                          <button
                            data-testid={`udtale-fjern-ja-${r.word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                            onClick={() => void fjern(r.word)}
                            style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                              border: "none", background: "var(--destructive)", color: "#fff",
                              cursor: "pointer", lineHeight: 1 }}>Yes</button>
                          <button
                            data-testid={`udtale-fjern-nej-${r.word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                            onClick={() => setBekraeft(null)}
                            style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                              border: "1px solid var(--border)", background: "transparent",
                              color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid={`udtale-fjern-${r.word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                          onClick={() => setBekraeft(r.word)}
                          style={{
                            padding: ".2rem .5rem", borderRadius: 5, border: "1px solid var(--border)",
                            background: "transparent", color: "var(--muted-foreground)",
                            fontSize: ".72rem", cursor: "pointer",
                          }}
                        >
                          Fjern
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <p style={{ color: "var(--muted-foreground)", fontSize: ".78rem", marginTop: "1.5rem", lineHeight: 1.6 }}>
          <Volume2 size={12} style={{ verticalAlign: "-2px", marginRight: ".3rem" }} />
          Ordbogen gælder sponsorindslag og værtens overgangsreplik. Afsnittenes egne
          replikker kan endnu ikke få den — dialog-motoren hos udbyderen tager ingen
          ordbog. Det er meldt videre.
        </p>
      </div>
    </>
  );
}
