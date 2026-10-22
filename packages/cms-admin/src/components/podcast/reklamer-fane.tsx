"use client";

/**
 * F191.4 · sponsor-arkivet — nu FANE 2 «Reklamer» i podcast-modulet (F191.8),
 * ikke sin egen rute. Skallen står i components/podcast-tabs.tsx.
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
import { Megaphone, Plus } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import { useT } from "@/lib/i18n-context";

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
  /** Regnet i MOTOREN og sendt med — skærmen kender hverken sats eller kurs. */
  prisDkk?: string;
};

/** Stemmerne SDK'et kender på dansk. Aidan bruger «jesper», så en reklame må
 *  ikke — hører man værten sælge noget, er det ikke en reklame, det er værten
 *  der bryder rollen. Det er Christians eget krav. */
const STEMMER = [
  { value: "mads", label: "voiceMads" },
  { value: "soren", label: "voiceSoren" },
  { value: "noam", label: "voiceNoam" },
  { value: "camilla", label: "voiceCamilla" },
  { value: "jesper", label: "voiceJesper" },
];

const felt: React.CSSProperties = {
  padding: ".4rem .55rem",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: ".85rem",
};

function sek(n: number | undefined, t: ReturnType<typeof useT>): string {
  if (!n) return "—";
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return m ? `${m}:${String(s).padStart(2, "0")}` : t("tools.podcast.adsTab.seconds", { n: s });
}

export function ReklamerFane() {
  const t = useT();
  const stemmer = STEMMER.map((s) => ({ value: s.value, label: t(`tools.podcast.adsTab.${s.label}`) }));
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
  /** Prisen for det manuskript der skrives lige nu. Hentes fra API'et frem for
   *  at blive regnet her — ellers ville skærmen have sin egen sats og sin egen
   *  valutakurs ved siden af motorens. Kaldet koster ingenting. */
  const [nyPris, setNyPris] = useState<string>("");
  useEffect(() => {
    const tekst = nyManus.trim();
    if (!tekst) { setNyPris(""); return; }
    const id = setTimeout(async () => {
      try {
        const r = await fetch("/api/podcast/estimate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tekst }),
        });
        const j = (await r.json()) as { estimat?: { prisDkk?: string } };
        if (r.ok && j.estimat?.prisDkk) setNyPris(j.estimat.prisDkk);
      } catch { /* uden pris skrives der bare videre */ }
    }, 400);
    return () => clearTimeout(id);
  }, [nyManus]);

  async function hent() {
    setHenter(true);
    try {
      const r = await fetch("/api/podcast/sponsor");
      const d = (await r.json()) as { sponsorer?: Sponsor[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setListe(d.sponsorer ?? []);
      setFejl(null);
    } catch (e) {
      setFejl(e instanceof Error ? e.message : t("tools.podcast.adsTab.loadFailed"));
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
      setFejl(e instanceof Error ? e.message : t("tools.podcast.adsTab.createFailed"));
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
      setFejl(e instanceof Error ? e.message : t("tools.podcast.adsTab.recordFailed"));
    } finally {
      setIndtaler(null);
    }
  }


  return (
    <div data-testid="podcast-fane-reklamer-indhold" style={{ maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: ".9rem" }}>
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
          <Plus size={14} /> {t("tools.podcast.adsTab.newSpot")}
        </button>
      </div>

      <div>
        <p style={{ color: "var(--muted-foreground)", fontSize: ".85rem", margin: "0 0 1rem" }}>
          {t("tools.podcast.adsTab.intro")}
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
              data-testid="sponsor-ny-slug" style={felt} placeholder={t("tools.podcast.adsTab.slugPlaceholder")}
              value={nySlug} onChange={(e) => setNySlug(e.target.value)}
            />
            <input
              data-testid="sponsor-ny-titel" style={felt} placeholder={t("tools.podcast.adsTab.titlePlaceholder")}
              value={nyTitel} onChange={(e) => setNyTitel(e.target.value)}
            />
            <input
              data-testid="sponsor-ny-sponsor" style={felt} placeholder={t("tools.podcast.adsTab.sponsorPlaceholder")}
              value={nySponsor} onChange={(e) => setNySponsor(e.target.value)}
            />
            <textarea
              data-testid="sponsor-ny-manuskript" style={{ ...felt, minHeight: 110, resize: "vertical" }}
              placeholder={t("tools.podcast.adsTab.scriptPlaceholder")}
              value={nyManus} onChange={(e) => setNyManus(e.target.value)}
            />
            <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
              <span style={{ fontSize: ".8rem", color: "var(--muted-foreground)" }}>{t("tools.podcast.adsTab.voice")}</span>
              {/* CustomSelect, ikke native <select> — husets regel. Den tager
                  ikke data-testid, så ankeret sidder på indpakningen. */}
              <span data-testid="sponsor-ny-stemme">
                <CustomSelect value={nyStemme} onChange={setNyStemme} options={stemmer} />
              </span>
              {nyManus.trim().length > 0 && (
                <span style={{ fontSize: ".78rem", color: "var(--muted-foreground)" }}>
                  {t("tools.podcast.adsTab.chars", { n: nyManus.trim().length })}{nyPris ? ` · ${t("tools.podcast.adsTab.priceToVoice", { price: nyPris })}` : ""}
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
                {gemmer ? t("tools.podcast.adsTab.saving") : t("tools.podcast.adsTab.create")}
              </button>
              <button
                type="button" data-testid="sponsor-annuller" onClick={() => setOpretter(false)}
                style={{
                  padding: ".4rem .9rem", borderRadius: 6, border: "1px solid var(--border)",
                  background: "transparent", color: "var(--foreground)", fontSize: ".82rem",
                  cursor: "pointer",
                }}
              >
                {t("tools.podcast.adsTab.cancel")}
              </button>
            </div>
          </div>
        )}

        {henter ? (
          <p style={{ color: "var(--muted-foreground)", fontSize: ".85rem" }}>{t("tools.podcast.adsTab.loading")}</p>
        ) : liste.length === 0 ? (
          <div
            data-testid="sponsor-tomt"
            style={{
              border: "1px dashed var(--border)", borderRadius: 8, padding: "2rem",
              textAlign: "center", color: "var(--muted-foreground)", fontSize: ".85rem",
            }}
          >
            <Megaphone size={22} style={{ opacity: 0.5, marginBottom: ".5rem" }} />
            <p style={{ margin: 0 }}>{t("tools.podcast.adsTab.empty")}</p>
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
                      {s.data.kilde === "tale" ? t("tools.podcast.adsTab.voiced", { voice: s.data.stemme ?? "?" }) : s.data.kilde === "upload" ? t("tools.podcast.adsTab.uploaded") : t("tools.podcast.adsTab.noAudio")}
                      {" · "}
                      {sek(s.data.sekunder, t)}
                    </div>
                  </div>
                  <div style={{ fontSize: ".78rem", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                    {/* Sponsorens eget spørgsmål. `null` betyder at opslaget
                        fejlede — det er IKKE det samme som «ingen afsnit», og
                        må derfor ikke vises som 0. */}
                    {s.brugtI === null
                      ? t("tools.podcast.adsTab.usageUnknown")
                      : s.brugtI.length === 0
                        ? t("tools.podcast.adsTab.notInUse")
                        : t("tools.podcast.adsTab.inEpisodes", { n: s.brugtI.length })}
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
                          {s.prisDkk ? t("tools.podcast.adsTab.confirmRecordFor", { price: s.prisDkk }) : t("tools.podcast.adsTab.confirmRecord")}
                        </span>
                        <button
                          type="button" data-testid="sponsor-indtal-ja"
                          onClick={() => void indtal(s)}
                          style={{
                            fontSize: ".75rem", padding: ".2rem .6rem", borderRadius: 4, border: "none",
                            background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer",
                          }}
                        >
                          {t("tools.podcast.adsTab.yes")}
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
                          {t("tools.podcast.adsTab.no")}
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
                        {indtaler === s.slug ? t("tools.podcast.adsTab.recording") : t("tools.podcast.adsTab.recordScript")}
                      </button>
                    )}
                    {!s.data.manuskript && (
                      <span style={{ fontSize: ".78rem", color: "var(--muted-foreground)" }}>
                        {t("tools.podcast.adsTab.noScriptHint")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
