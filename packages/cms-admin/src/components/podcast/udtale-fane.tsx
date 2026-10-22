"use client";

/**
 * F191.6 · udtale-ordbogen — nu FANE 3 i podcast-modulet (F191.8), ikke sin
 * egen rute. Skallen står i components/podcast-tabs.tsx.
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
import { Fragment, useEffect, useState } from "react";
import { Plus, Volume2 } from "lucide-react";
import { useT } from "@/lib/i18n-context";

type Raekke = { word: string; alias?: string; ipa?: string };

const felt: React.CSSProperties = {
  padding: ".4rem .55rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: ".85rem",
};

export function UdtaleFane() {
  const t = useT();
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
      setFejl(e instanceof Error ? e.message : t("tools.podcast.pronunciationTab.loadFailed"));
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
      setFejl(e instanceof Error ? e.message : t("tools.podcast.pronunciationTab.saveFailed"));
    } finally {
      setGemmer(false);
    }
  }

  async function tilfoej() {
    const word = nytOrd.trim();
    const alias = nyLyd.trim();
    if (!word || !alias) {
      setFejl(t("tools.podcast.pronunciationTab.bothRequired"));
      return;
    }
    // Samme ord to gange ville give to regler der kæmper om samme tekst.
    const uden = raekker.filter((r) => r.word.toLowerCase() !== word.toLowerCase());
    await gem([...uden, { word, alias }], t("tools.podcast.pronunciationTab.added", { word, alias }));
    setNytOrd("");
    setNyLyd("");
  }

  async function fjern(word: string) {
    setBekraeft(null);
    await gem(raekker.filter((r) => r.word !== word), t("tools.podcast.pronunciationTab.removed", { word }));
  }

  return (
    <div data-testid="podcast-fane-udtale-indhold">
      <div style={{ maxWidth: 860 }} data-testid="udtale-root">
        <p style={{ color: "var(--muted-foreground)", fontSize: ".85rem", margin: "0 0 1rem", lineHeight: 1.55 }}>
          {t("tools.podcast.pronunciationTab.intro").split("{sound}").map((del, i) => (
            <Fragment key={i}>{i > 0 && <em>{t("tools.podcast.pronunciationTab.soundWord")}</em>}{del}</Fragment>
          ))}
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
            placeholder={t("tools.podcast.pronunciationTab.wordPlaceholder")}
            style={{ ...felt, flex: "1 1 200px" }}
          />
          <span style={{ color: "var(--muted-foreground)", fontSize: ".85rem" }}>{t("tools.podcast.pronunciationTab.said")}</span>
          <input
            data-testid="udtale-ny-lyd"
            value={nyLyd}
            onChange={(e) => setNyLyd(e.target.value)}
            placeholder={t("tools.podcast.pronunciationTab.soundPlaceholder")}
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
            <Plus size={14} /> {gemmer ? t("tools.podcast.pronunciationTab.saving") : t("tools.podcast.pronunciationTab.add")}
          </button>
        </div>

        {henter ? (
          <p style={{ color: "var(--muted-foreground)", fontSize: ".85rem" }}>{t("tools.podcast.pronunciationTab.loading")}</p>
        ) : raekker.length === 0 ? (
          <p data-testid="udtale-tom" style={{ color: "var(--muted-foreground)", fontSize: ".85rem" }}>
            {t("tools.podcast.pronunciationTab.empty")}
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted-foreground)" }}>
                <th style={{ padding: ".4rem .5rem", fontWeight: 500 }}>{t("tools.podcast.pronunciationTab.colWord")}</th>
                <th style={{ padding: ".4rem .5rem", fontWeight: 500 }}>{t("tools.podcast.pronunciationTab.colSaid")}</th>
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
                          {t("tools.podcast.pronunciationTab.notSent")}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: ".5rem", textAlign: "right" }}>
                      {bekraeft === r.word ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: ".3rem" }}>
                          <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>{t("tools.podcast.pronunciationTab.removeConfirm")}</span>
                          <button
                            data-testid={`udtale-fjern-ja-${r.word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                            onClick={() => void fjern(r.word)}
                            style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                              border: "none", background: "var(--destructive)", color: "#fff",
                              cursor: "pointer", lineHeight: 1 }}>{t("common.yes")}</button>
                          <button
                            data-testid={`udtale-fjern-nej-${r.word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                            onClick={() => setBekraeft(null)}
                            style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                              border: "1px solid var(--border)", background: "transparent",
                              color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>{t("common.no")}</button>
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
                          {t("tools.podcast.pronunciationTab.remove")}
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
          {t("tools.podcast.pronunciationTab.footer")}
        </p>
      </div>
    </div>
  );
}
