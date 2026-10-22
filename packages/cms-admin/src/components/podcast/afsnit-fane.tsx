"use client";

/**
 * F189.6 · afsnitslisten — nu FANE 1 i podcast-modulet (F191.8), ikke sin egen
 * rute. Skallen der holder fanerne står i components/podcast-tabs.tsx.
 *
 * KLIENT AF API'ET, ikke af motoren. Der er med vilje ingen import fra
 * lib/podcast/* i denne fil: kunne cms-admin komme uden om /api/podcast/*,
 * ville der være to veje ind i motoren hvoraf kun den ene er prøvet — og
 * site-panelet ude i kundens eget site ville få den utestede.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Mic, Plus } from "lucide-react";
import { useHeaderData } from "@/lib/header-data-context";
import { useT } from "@/lib/i18n-context";

type Tilstand = "kladde" | "manuskript-klar" | "godkendt" | "indspillet" | "udgivet";

type Afsnit = {
  slug: string;
  data: {
    titel: string;
    artikelSlug: string;
    tilstand: Tilstand;
    nummer?: number;
    saeson?: number;
    replikker: { speaker: string; text: string }[];
    lydUrl?: string;
    udgivetAt?: string;
  };
};

/** Mockup'ens fem tilstande med deres tegn. Rækkefølgen er maskinens.
 *  `tekst` er en katalognøgle — oversættes når den vises. */
const TILSTAND: Record<Tilstand, { tegn: string; tekst: string; farve: string }> = {
  kladde: { tegn: "○", tekst: "stateKladde", farve: "var(--muted-foreground)" },
  "manuskript-klar": { tegn: "◔", tekst: "stateManuskriptKlar", farve: "var(--foreground)" },
  godkendt: { tegn: "★", tekst: "stateGodkendt", farve: "#b8860b" },
  indspillet: { tegn: "♪", tekst: "stateIndspillet", farve: "#0d7a5f" },
  udgivet: { tegn: "●", tekst: "stateUdgivet", farve: "#0d7a5f" },
};

/** Groft minut-tal ud fra tegn, samme takt som motorens estimat (900 tegn/min).
 *  Vises som «~11 min» — et cirka-tal, og det siges med tilden. */
function anslaaMinutter(replikker: { text: string }[]): number | null {
  const tegn = replikker.reduce((n, r) => n + r.text.length, 0);
  if (!tegn) return null;
  return Math.max(1, Math.round(tegn / 900));
}

const felt: React.CSSProperties = {
  padding: ".4rem .55rem", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--background)", color: "var(--foreground)", fontSize: ".85rem",
};

export function AfsnitFane() {
  const t = useT();
  const [afsnit, setAfsnit] = useState<Afsnit[]>([]);
  const [henter, setHenter] = useState(true);
  const [fejl, setFejl] = useState<string | null>(null);
  const [opretter, setOpretter] = useState(false);
  const [nySlug, setNySlug] = useState("");
  const [nyTitel, setNyTitel] = useState("");
  const [nyNummer, setNyNummer] = useState("");
  const [nySaeson, setNySaeson] = useState("");
  const [gemmer, setGemmer] = useState(false);
  const [opretFejl, setOpretFejl] = useState<string | null>(null);

  const { user } = useHeaderData();
  // UX-gating. Sikkerhedsgrænsen er server-siden (layout.tsx + hver rute);
  // her skjuler vi bare en knap der ville svare 403.
  const maaSkrive = !!user?.permissions?.includes("podcast.edit");

  async function opret(e: React.FormEvent) {
    e.preventDefault();
    setGemmer(true);
    setOpretFejl(null);
    try {
      const r = await fetch("/api/podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: nySlug.trim(),
          titel: nyTitel.trim(),
          nummer: nyNummer,
          saeson: nySaeson,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { afsnit?: Afsnit; error?: string };
      // Svaret LÆSES. Et `await fetch()` uden at se på r.ok gør en 400 til en
      // succes-sti, og en tavs 4xx kan ikke skelnes fra at det virkede.
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      if (d.afsnit) setAfsnit((a) => [d.afsnit!, ...a]);
      setOpretter(false);
      setNySlug(""); setNyTitel(""); setNyNummer(""); setNySaeson("");
    } catch (err) {
      setOpretFejl(err instanceof Error ? err.message : t("tools.podcast.episodesTab.createFailed"));
    } finally {
      setGemmer(false);
    }
  }

  useEffect(() => {
    fetch("/api/podcast")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { afsnit: Afsnit[] }) => setAfsnit(d.afsnit ?? []))
      .catch((e: Error) => setFejl(e.message))
      .finally(() => setHenter(false));
  }, []);

  return (
    <div data-testid="podcast-fane-afsnit-indhold">
      {maaSkrive && !opretter && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: ".9rem" }}>
          <button
            onClick={() => { setOpretter(true); setOpretFejl(null); }}
            data-testid="podcast-nyt-afsnit"
            style={{
              display: "flex", alignItems: "center", gap: ".35rem",
              fontSize: ".8rem", padding: ".35rem .7rem", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--background)",
              color: "var(--foreground)", cursor: "pointer",
            }}
          >
            <Plus style={{ width: 14, height: 14 }} /> {t("tools.podcast.episodesTab.newEpisode")}
          </button>
        </div>
      )}

      <div>
        <p style={{ color: "var(--muted-foreground)", margin: "0 0 1.5rem", fontSize: ".9rem" }}>
          {t("tools.podcast.episodesTab.intro")}
        </p>

        {opretter && (
          <form
            onSubmit={opret}
            data-testid="podcast-opret-form"
            style={{
              border: "1px solid var(--border)", borderRadius: 10, padding: "1rem",
              marginBottom: "1.25rem", display: "grid", gap: ".7rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))", alignItems: "end",
            }}
          >
            <label style={{ display: "grid", gap: ".25rem", fontSize: ".78rem", color: "var(--muted-foreground)" }}>
              {t("tools.podcast.episodesTab.slugLabel")}
              <input
                autoFocus
                required
                value={nySlug}
                onChange={(e) => setNySlug(e.target.value)}
                placeholder={t("tools.podcast.episodesTab.slugPlaceholder")}
                data-testid="podcast-opret-slug"
                style={felt}
              />
            </label>
            <label style={{ display: "grid", gap: ".25rem", fontSize: ".78rem", color: "var(--muted-foreground)" }}>
              {t("tools.podcast.episodesTab.titleLabel")}
              <input
                value={nyTitel}
                onChange={(e) => setNyTitel(e.target.value)}
                placeholder={t("tools.podcast.episodesTab.untitled")}
                data-testid="podcast-opret-titel"
                style={felt}
              />
            </label>
            <label style={{ display: "grid", gap: ".25rem", fontSize: ".78rem", color: "var(--muted-foreground)" }}>
              {t("tools.podcast.episodesTab.season")}
              <input
                type="number" min={1} value={nySaeson}
                onChange={(e) => setNySaeson(e.target.value)}
                placeholder="1"
                data-testid="podcast-opret-saeson"
                style={felt}
              />
            </label>
            <label style={{ display: "grid", gap: ".25rem", fontSize: ".78rem", color: "var(--muted-foreground)" }}>
              {t("tools.podcast.episodesTab.numberInSeason")} <span style={{ opacity: .7 }}>(1-24)</span>
              <input
                type="number" min={1} max={24} value={nyNummer}
                onChange={(e) => setNyNummer(e.target.value)}
                placeholder="1"
                data-testid="podcast-opret-nummer"
                style={felt}
              />
            </label>
            <div style={{ display: "flex", gap: ".4rem" }}>
              <button
                type="submit" disabled={gemmer}
                data-testid="podcast-opret-gem"
                style={{
                  fontSize: ".8rem", padding: ".4rem .8rem", borderRadius: 6, border: "none",
                  background: "var(--primary)", color: "var(--primary-foreground)",
                  cursor: gemmer ? "wait" : "pointer", opacity: gemmer ? .7 : 1,
                }}
              >
                {gemmer ? t("tools.podcast.episodesTab.creating") : t("tools.podcast.episodesTab.create")}
              </button>
              <button
                type="button" onClick={() => setOpretter(false)}
                data-testid="podcast-opret-fortryd"
                style={{
                  fontSize: ".8rem", padding: ".4rem .8rem", borderRadius: 6,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--foreground)", cursor: "pointer",
                }}
              >
                {t("tools.podcast.episodesTab.cancel")}
              </button>
            </div>
            {opretFejl && (
              <p data-testid="podcast-opret-fejl" style={{ gridColumn: "1 / -1", margin: 0, color: "var(--destructive)", fontSize: ".8rem" }}>
                {opretFejl}
              </p>
            )}
            <p style={{ gridColumn: "1 / -1", margin: 0, color: "var(--muted-foreground)", fontSize: ".75rem" }}>
              {t("tools.podcast.episodesTab.createHint")}
            </p>
          </form>
        )}

        {henter ? (
          <p data-testid="podcast-henter" style={{ color: "var(--muted-foreground)" }}>
            {t("tools.podcast.episodesTab.loading")}
          </p>
        ) : fejl ? (
          /* Motoren er ship-dark: mangler sitet sin podcast-samling, siger
             beskeden nøjagtig hvad der mangler frem for «Unknown collection». */
          <div
            data-testid="podcast-fejl"
            style={{
              border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem",
              background: "var(--muted)", color: "var(--foreground)", lineHeight: 1.6,
            }}
          >
            {fejl}
          </div>
        ) : afsnit.length === 0 ? (
          <div
            data-testid="podcast-tom"
            style={{
              border: "1px dashed var(--border)", borderRadius: 10, padding: "2rem",
              color: "var(--muted-foreground)", textAlign: "center", lineHeight: 1.6,
            }}
          >
            <Mic style={{ width: 22, height: 22, opacity: .5, marginBottom: ".5rem" }} />
            <div>{t("tools.podcast.episodesTab.empty")}</div>
            <div style={{ fontSize: ".85rem", marginTop: ".35rem" }}>
              {t("tools.podcast.episodesTab.emptyHint")}
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }} data-testid="podcast-tabel">
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted-foreground)", fontSize: ".78rem" }}>
                <th style={{ padding: ".5rem .6rem", fontWeight: 500 }}>#</th>
                <th style={{ padding: ".5rem .6rem", fontWeight: 500 }}>{t("tools.podcast.episodesTab.colEpisode")}</th>
                <th style={{ padding: ".5rem .6rem", fontWeight: 500 }}>{t("tools.podcast.episodesTab.colStatus")}</th>
                <th style={{ padding: ".5rem .6rem", fontWeight: 500 }}>{t("tools.podcast.episodesTab.colLength")}</th>
              </tr>
            </thead>
            <tbody>
              {afsnit.map((a) => {
                const st = TILSTAND[a.data.tilstand] ?? TILSTAND.kladde;
                const min = anslaaMinutter(a.data.replikker);
                return (
                  <tr key={a.slug} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: ".7rem .6rem", color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {a.data.nummer === undefined
                        ? "—"
                        : a.data.saeson === undefined
                          ? String(a.data.nummer).padStart(2, "0")
                          : `S${a.data.saeson}·${String(a.data.nummer).padStart(2, "0")}`}
                    </td>
                    <td style={{ padding: ".7rem .6rem" }}>
                      <Link
                        href={`/admin/podcast/${a.slug}`}
                        data-testid="podcast-afsnit-link"
                        style={{ color: "var(--foreground)", textDecoration: "none", fontWeight: 500 }}
                      >
                        {a.data.titel || a.slug}
                      </Link>
                      <div style={{ color: "var(--muted-foreground)", fontSize: ".78rem", marginTop: ".15rem" }}>
                        {a.data.artikelSlug ? t("tools.podcast.from", { slug: a.data.artikelSlug }) : t("tools.podcast.episodesTab.noArticle")}
                      </div>
                    </td>
                    <td style={{ padding: ".7rem .6rem", color: st.farve, whiteSpace: "nowrap" }}>
                      <span aria-hidden="true">{st.tegn}</span> {t(`tools.podcast.episodesTab.${st.tekst}`)}
                    </td>
                    <td style={{ padding: ".7rem .6rem", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                      {min === null ? "—" : t("tools.podcast.minutes", { n: min })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
