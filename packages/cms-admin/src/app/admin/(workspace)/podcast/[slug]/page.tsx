"use client";

/**
 * F189.6 · skærm 2, 3 og 4 — manuskriptet, bekræftelsen med prisen, og
 * afsnittet efter indspilning. Én side, fordi det er ÉT afsnit man arbejder på;
 * mockup'ens tre billeder er tre tilstande af den samme skærm.
 *
 * KLIENT AF API'ET. Ingen import fra lib/podcast/* — hver handling går gennem
 * /api/podcast/*, så et site der bygger sin egen udgave med sit eget udseende
 * har præcis de samme muligheder som denne side. Kunne cms-admin gå udenom,
 * ville der være to veje ind i motoren hvoraf kun den ene er prøvet.
 */
import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { CustomSelect } from "@/components/ui/custom-select";
import { useHeaderData } from "@/lib/header-data-context";
import { useT } from "@/lib/i18n-context";

/** Renders a translated sentence whose {placeholders} are React nodes. */
function withParts(text: string, parts: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((p, i) => {
    const m = p.match(/^\{(\w+)\}$/);
    return <Fragment key={i}>{m && m[1] in parts ? parts[m[1]] : p}</Fragment>;
  });
}

type Tilstand = "kladde" | "manuskript-klar" | "godkendt" | "indspillet" | "udgivet";
type Replik = { speaker: string; text: string };

type Afsnit = {
  slug: string;
  data: {
    titel: string; artikelSlug: string; tilstand: Tilstand; replikker: Replik[];
    nummer?: number; saeson?: number;
    stemmer?: { aidan: string; airina: string };
    lydUrl?: string; faktiskPrisUsd?: number;
  };
};

type Tjek = { navn: string; ok: boolean; detalje: string };
type Estimat = { tegn: number; prisUsd: number; prisDkk: string; kursMaalt: string; kursKilde: "opslag" | "reserve"; kurs: number; minutter: number };

const STATUS: Record<Tilstand, string> = {
  kladde: "tools.podcast.status.kladde",
  "manuskript-klar": "tools.podcast.status.manuskriptKlar",
  godkendt: "tools.podcast.status.godkendt",
  indspillet: "tools.podcast.status.indspillet",
  udgivet: "tools.podcast.status.udgivet",
};

/** De fem danske stemmer @broberg/ai-sdk kender. Navnene er SDK'ets egne
 *  aliasser, ikke rå id'er — motoren slår dem op. */
const STEMMER = [
  { value: "soren", label: "Søren" },
  { value: "jesper", label: "Jesper" },
  { value: "mads", label: "Mads" },
  { value: "noam", label: "Noam" },
  { value: "camilla", label: "Camilla" },
];

const knap = (primaer: boolean, slukket = false): React.CSSProperties => ({
  fontSize: ".82rem", padding: ".45rem .9rem", borderRadius: 6,
  border: primaer ? "none" : "1px solid var(--border)",
  background: slukket ? "var(--muted)" : primaer ? "var(--primary)" : "transparent",
  color: slukket ? "var(--muted-foreground)" : primaer ? "var(--primary-foreground)" : "var(--foreground)",
  cursor: slukket ? "not-allowed" : "pointer",
});

export default function PodcastAfsnitPage() {
  const t = useT();
  const slug = String(useParams().slug ?? "");
  const { user } = useHeaderData();
  const maaSkrive = !!user?.permissions?.includes("podcast.edit");
  const maaIndspille = !!user?.permissions?.includes("podcast.record");

  const [afsnit, setAfsnit] = useState<Afsnit | null>(null);
  const [replikker, setReplikker] = useState<Replik[]>([]);
  const [aidan, setAidan] = useState("jesper");
  const [airina, setAirina] = useState("camilla");
  const [estimat, setEstimat] = useState<Estimat | null>(null);
  const [tjek, setTjek] = useState<Tjek[]>([]);
  const [henter, setHenter] = useState(true);
  const [fejl, setFejl] = useState<string | null>(null);
  const [arbejder, setArbejder] = useState<string | null>(null);
  /** Kursen AFLEDES af estimatets egne to tal (kroner ÷ dollars) i stedet for
   *  at stå som en konstant her. Så kan skærmen vise «kostede X kr» for en
   *  gammel indspilning uden at have sin egen kurs at drive med. */
  const kurs = estimat && estimat.prisUsd > 0
    ? Number(estimat.prisDkk.replace(" kr", "").replace(",", ".")) / estimat.prisUsd
    : null;
  const [bekraeft, setBekraeft] = useState(false);

  // F191.7 — upload af et rettet manuskript.
  const [uploader, setUploader] = useState(false);
  const [manusFejl, setManusFejl] = useState<string | null>(null);
  const [manusOk, setManusOk] = useState<string | null>(null);

  async function lagOpManus(fil: File) {
    setUploader(true);
    setManusFejl(null);
    setManusOk(null);
    try {
      const tekst = await fil.text();
      const r = await fetch(`/api/podcast/${slug}/manuskript`, {
        method: "PUT",
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: tekst,
      });
      const j = (await r.json()) as { error?: string; linje?: number; antal?: number };
      if (!r.ok) {
        // Beskeden fra serveren VISES ordret. Den navngiver linjen; en
        // omskrivning her ville tage det eneste brugbare ud af den.
        setManusFejl(j.error ?? t("tools.podcast.fileRejected", { status: r.status }));
        return;
      }
      setManusOk(t("tools.podcast.uploadOk", { n: j.antal ?? 0 }));
      // LÆS TILBAGE fra serveren frem for at tro på svaret: det er dokumentet
      // på skærmen der skal vise det nye, ikke vores egen hukommelse om det.
      await hent();
    } catch (e) {
      setManusFejl(e instanceof Error ? e.message : t("tools.podcast.fileUnreadable"));
    } finally {
      setUploader(false);
    }
  }
  const [beskedOk, setBeskedOk] = useState<string | null>(null);

  const hent = useCallback(async () => {
    const r = await fetch(`/api/podcast/${slug}`);
    const d = (await r.json().catch(() => ({}))) as { afsnit?: Afsnit; error?: string };
    if (!r.ok) { setFejl(d.error ?? `HTTP ${r.status}`); return; }
    if (d.afsnit) {
      setAfsnit(d.afsnit);
      setReplikker(d.afsnit.data.replikker);
      if (d.afsnit.data.stemmer) { setAidan(d.afsnit.data.stemmer.aidan); setAirina(d.afsnit.data.stemmer.airina); }
    }
    const e = await fetch(`/api/podcast/${slug}/estimate`);
    const ed = (await e.json().catch(() => ({}))) as { estimat?: Estimat; foerFlyvning?: { tjek: Tjek[] } };
    if (e.ok) { setEstimat(ed.estimat ?? null); setTjek(ed.foerFlyvning?.tjek ?? []); }
  }, [slug]);

  useEffect(() => { void hent().finally(() => setHenter(false)); }, [hent]);

  /** Ét sted for alle skrivninger, så fejlhåndteringen ikke findes i seks
   *  udgaver hvoraf én glemmer at læse r.ok. */
  async function kald(navn: string, sti: string, krop?: unknown, metode = "POST") {
    setArbejder(navn); setFejl(null); setBeskedOk(null);
    try {
      const r = await fetch(`/api/podcast/${slug}${sti}`, {
        method: metode,
        headers: { "Content-Type": "application/json" },
        ...(krop ? { body: JSON.stringify(krop) } : {}),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      await hent();
      return true;
    } catch (e) {
      setFejl(e instanceof Error ? e.message : t("tools.podcast.somethingWrong"));
      return false;
    } finally {
      setArbejder(null);
    }
  }

  const tilstand = afsnit?.data.tilstand ?? "kladde";
  const godkendt = tilstand === "godkendt";
  const harLyd = !!afsnit?.data.lydUrl;

  if (henter) return <div style={{ padding: "1.5rem" }} data-testid="podcast-afsnit-henter">{t("tools.podcast.loading")}</div>;

  return (
    <div data-testid="podcast-afsnit-root">
      <ActionBar>
        <ActionBarBreadcrumb items={[t("tools.podcast.title"), afsnit?.data.titel || slug]} />
      </ActionBar>

      <div style={{ padding: "1.5rem", display: "grid", gap: "1.5rem", gridTemplateColumns: "minmax(0,1fr) 20rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1rem" }}>
            <span data-testid="podcast-afsnit-status" style={{ fontSize: ".8rem", color: "var(--muted-foreground)" }}>
              {t(STATUS[tilstand])}
            </span>
            {afsnit?.data.artikelSlug && (
              <span style={{ fontSize: ".78rem", color: "var(--muted-foreground)" }}>
                {t("tools.podcast.from", { slug: afsnit.data.artikelSlug })}
              </span>
            )}
          </div>

          <h2 style={{ fontSize: ".95rem", margin: "0 0 .25rem" }}>{t("tools.podcast.script")}</h2>
          <p style={{ color: "var(--muted-foreground)", fontSize: ".8rem", margin: "0 0 1rem" }}>
            {t("tools.podcast.lineStats", { lines: replikker.length, chars: replikker.reduce((n, r) => n + r.text.length, 0).toLocaleString("da-DK") })}
          </p>

          {replikker.length === 0 ? (
            <p data-testid="podcast-manuskript-tomt" style={{
              border: "1px dashed var(--border)", borderRadius: 8, padding: "1.5rem",
              color: "var(--muted-foreground)", fontSize: ".85rem", lineHeight: 1.6,
            }}>
              {t("tools.podcast.noLines")}
            </p>
          ) : (
            <div style={{ display: "grid", gap: ".6rem" }} data-testid="podcast-replikker">
              {replikker.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "6rem 1fr", gap: ".6rem", alignItems: "start" }}>
                  <div style={{ fontSize: ".72rem", color: "var(--muted-foreground)", textTransform: "uppercase", paddingTop: ".5rem" }}>
                    {r.speaker}
                  </div>
                  <textarea
                    value={r.text}
                    disabled={!maaSkrive}
                    data-testid="podcast-replik-tekst"
                    onChange={(e) => setReplikker((rs) => rs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    style={{
                      width: "100%", minHeight: "3.2rem", padding: ".5rem .6rem", borderRadius: 6,
                      border: "1px solid var(--border)", background: "var(--background)",
                      color: "var(--foreground)", fontSize: ".85rem", lineHeight: 1.5, resize: "vertical",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {maaSkrive && replikker.length > 0 && (
            <div style={{ display: "flex", gap: ".5rem", marginTop: "1rem" }}>
              <button
                data-testid="podcast-gem-manuskript"
                disabled={arbejder === "gem"}
                onClick={() => void kald("gem", "", { replikker }, "PATCH")}
                style={knap(true, arbejder === "gem")}
              >
                {arbejder === "gem" ? t("tools.podcast.saving") : t("tools.podcast.saveScript")}
              </button>
              <span style={{ fontSize: ".75rem", color: "var(--muted-foreground)", alignSelf: "center" }}>
                {t("tools.podcast.editRevokes")}
              </span>
            </div>
          )}
        </div>

        {/* ── Sidepanel: værter, før studiet, pris, handlinger ─────────── */}
        <aside style={{ display: "grid", gap: "1.25rem", alignContent: "start" }}>
          <section>
            <h3 style={{ fontSize: ".8rem", margin: "0 0 .6rem" }}>{t("tools.podcast.hosts")}</h3>
            <div style={{ display: "grid", gap: ".5rem" }}>
              <label style={{ display: "grid", gap: ".2rem", fontSize: ".75rem", color: "var(--muted-foreground)" }}>
                {t("tools.podcast.aidanRole")}
                <span data-testid="podcast-stemme-aidan">
                  <CustomSelect options={STEMMER} value={aidan} onChange={setAidan} disabled={!maaSkrive} />
                </span>
              </label>
              <label style={{ display: "grid", gap: ".2rem", fontSize: ".75rem", color: "var(--muted-foreground)" }}>
                {t("tools.podcast.airinaRole")}
                <span data-testid="podcast-stemme-airina">
                  <CustomSelect options={STEMMER} value={airina} onChange={setAirina} disabled={!maaSkrive} />
                </span>
              </label>
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: ".8rem", margin: "0 0 .6rem" }}>
              {t("tools.podcast.beforeStudio")}{" "}
              <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>
                {t("tools.podcast.checksOf", { ok: tjek.filter((c) => c.ok).length, total: tjek.length })}
              </span>
            </h3>
            <ul data-testid="podcast-foer-studiet" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: ".45rem" }}>
              {tjek.map((c) => (
                <li key={c.navn} style={{ display: "grid", gridTemplateColumns: "1rem 1fr", gap: ".4rem", fontSize: ".78rem" }}>
                  <span aria-hidden="true" style={{ color: c.ok ? "#0d7a5f" : "var(--muted-foreground)" }}>{c.ok ? "✓" : "•"}</span>
                  <span>
                    {c.navn}
                    {c.detalje && (
                      <span style={{ display: "block", color: "var(--muted-foreground)", fontSize: ".72rem", marginTop: ".1rem" }}>
                        {c.detalje}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {estimat && (
            <section>
              <h3 style={{ fontSize: ".8rem", margin: "0 0 .6rem" }}>{t("tools.podcast.whatItCosts")}</h3>
              <dl data-testid="podcast-pris" style={{ margin: 0, fontSize: ".78rem", display: "grid", gap: ".3rem" }}>
                {[
                  [t("tools.podcast.charsInScript"), estimat.tegn.toLocaleString("da-DK")],
                  [t("tools.podcast.thisRecording"), estimat.prisDkk],
                  [t("tools.podcast.estimatedLength"), t("tools.podcast.minutes", { n: estimat.minutter })],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <dt style={{ color: "var(--muted-foreground)" }}>{k}</dt>
                    <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{v}</dd>
                  </div>
                ))}
              </dl>
              {/* Regningen kommer i DOLLARS. Kronebeløbet er en oversættelse
                  til læseren, ikke det tal der trækkes — og en kurs bevæger
                  sig, så den står med sin dato frem for at lade som om den er
                  evig. */}
              <p
                data-testid="podcast-pris-kurs"
                style={{ margin: ".5rem 0 0", fontSize: ".68rem", color: "var(--muted-foreground)" }}
              >
                {t(estimat.kursKilde === "reserve" ? "tools.podcast.billedNoteReserve" : "tools.podcast.billedNote", { usd: estimat.prisUsd.toFixed(2), date: estimat.kursMaalt })}
              </p>
            </section>
          )}

          {/* F191.7 — manuskriptet ud og ind igen. Christian 8/9: han vil kunne
              rette teksten i sin egen editor. Download er en almindelig
              tekstfil; upload validerer FØR noget skrives, og fejlen navngiver
              linjen — «ugyldigt format» ville tvinge ham til selv at lede. */}
          {replikker.length > 0 && (
            <section style={{ display: "grid", gap: ".45rem" }}>
              <h3 style={{ fontSize: ".8rem", margin: 0 }}>{t("tools.podcast.scriptAsFile")}</h3>
              <a
                href={`/api/podcast/${slug}/manuskript`}
                download
                data-testid="podcast-manus-download"
                style={{
                  display: "inline-flex", alignItems: "center", gap: ".35rem",
                  padding: ".35rem .7rem", borderRadius: 6, border: "1px solid var(--border)",
                  background: "var(--background)", color: "var(--foreground)",
                  fontSize: ".78rem", textDecoration: "none", justifyContent: "center",
                }}
              >
                {t("tools.podcast.downloadScript")}
              </a>
              {maaSkrive && (
                <>
                  <label
                    data-testid="podcast-manus-upload-label"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: ".35rem",
                      padding: ".35rem .7rem", borderRadius: 6, border: "1px solid var(--border)",
                      background: "var(--background)", color: "var(--foreground)",
                      fontSize: ".78rem", cursor: uploader ? "wait" : "pointer", justifyContent: "center",
                      opacity: uploader ? 0.6 : 1,
                    }}
                  >
                    {uploader ? t("tools.podcast.readingFile") : t("tools.podcast.uploadScript")}
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      data-testid="podcast-manus-upload"
                      disabled={uploader}
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0];
                        // Feltet nulstilles, så den SAMME fil kan lægges op igen
                        // efter en rettelse — ellers sker der ingenting anden gang.
                        e.currentTarget.value = "";
                        if (f) void lagOpManus(f);
                      }}
                    />
                  </label>
                  {manusFejl && (
                    <p
                      data-testid="podcast-manus-fejl"
                      style={{
                        margin: 0, fontSize: ".72rem", color: "var(--destructive)",
                        lineHeight: 1.5, whiteSpace: "pre-wrap",
                      }}
                    >
                      {manusFejl}
                    </p>
                  )}
                  {manusOk && (
                    <p data-testid="podcast-manus-ok" style={{ margin: 0, fontSize: ".72rem", color: "var(--muted-foreground)" }}>
                      {manusOk}
                    </p>
                  )}
                </>
              )}
            </section>
          )}

          <section style={{ display: "grid", gap: ".5rem" }}>
            {maaSkrive && !godkendt && !harLyd && replikker.length > 0 && (
              <button
                data-testid="podcast-godkend"
                disabled={arbejder === "godkend"}
                onClick={() => void kald("godkend", "/state", { tilstand: "godkendt" })}
                style={knap(false, arbejder === "godkend")}
              >
                {t("tools.podcast.approveScript")}
              </button>
            )}

            {maaIndspille && !bekraeft && (
              <>
                <button
                  data-testid="podcast-indspil"
                  disabled={!godkendt || arbejder !== null}
                  onClick={() => setBekraeft(true)}
                  style={knap(true, !godkendt || arbejder !== null)}
                >
                  {estimat ? t("tools.podcast.recordFor", { price: estimat.prisDkk }) : t("tools.podcast.record")}
                </button>
                {!godkendt && (
                  <p data-testid="podcast-indspil-hjaelp" style={{ margin: 0, fontSize: ".72rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                    {t("tools.podcast.recordDisabledHint")}
                  </p>
                )}
              </>
            )}

            {/* Husets mønster: ingen window.confirm, egne farver, Ja/Nej.
                Prisen står PÅ knappen — ikke i en note ved siden af. */}
            {bekraeft && (
              <div data-testid="podcast-bekraeft" style={{
                border: "1px solid var(--border)", borderRadius: 8, padding: ".9rem",
                background: "var(--muted)", display: "grid", gap: ".6rem",
              }}>
                <p style={{ margin: 0, fontSize: ".8rem", lineHeight: 1.5 }}>
                  {withParts(t("tools.podcast.confirmRecord"), { aidan: <b>{aidan}</b>, airina: <b>{airina}</b> })}
                </p>
                <div style={{ display: "flex", gap: ".4rem" }}>
                  <button
                    data-testid="podcast-bekraeft-ja"
                    disabled={arbejder === "indspil"}
                    onClick={async () => {
                      const ok = await kald("indspil", "/record", { stemmer: { aidan, airina } });
                      setBekraeft(false);
                      if (ok) setBeskedOk(t("tools.podcast.recorded"));
                    }}
                    style={{
                      fontSize: ".78rem", padding: ".35rem .7rem", borderRadius: 4, border: "none",
                      background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer",
                    }}
                  >
                    {arbejder === "indspil" ? t("tools.podcast.recording") : estimat ? t("tools.podcast.yesRecordFor", { price: estimat.prisDkk }) : t("tools.podcast.yesRecord")}
                  </button>
                  <button
                    data-testid="podcast-bekraeft-nej"
                    onClick={() => setBekraeft(false)}
                    style={{
                      fontSize: ".78rem", padding: ".35rem .7rem", borderRadius: 4,
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--foreground)", cursor: "pointer",
                    }}
                  >
                    {t("tools.podcast.no")}
                  </button>
                </div>
              </div>
            )}

            {/* Skærm 4 — efter indspilning. */}
            {harLyd && (
              <section data-testid="podcast-efter-indspilning" style={{ display: "grid", gap: ".5rem" }}>
                <audio controls src={afsnit!.data.lydUrl} data-testid="podcast-afspiller" style={{ width: "100%" }} />
                {typeof afsnit!.data.faktiskPrisUsd === "number" && (
                  <p style={{ margin: 0, fontSize: ".72rem", color: "var(--muted-foreground)" }}>
                    {t("tools.podcast.cost", { amount: kurs ? `${(afsnit!.data.faktiskPrisUsd * kurs).toFixed(2).replace(".", ",")} kr` : `$${afsnit!.data.faktiskPrisUsd.toFixed(2)}` })}
                  </p>
                )}
                {maaSkrive && tilstand !== "udgivet" && (
                  <button
                    data-testid="podcast-udgiv"
                    disabled={arbejder === "udgiv"}
                    onClick={() => void kald("udgiv", "/state", { tilstand: "udgivet" })}
                    style={knap(true, arbejder === "udgiv")}
                  >
                    {t("tools.podcast.publish")}
                  </button>
                )}
              </section>
            )}

            {fejl && (
              <p data-testid="podcast-fejl" style={{ margin: 0, color: "var(--destructive)", fontSize: ".78rem", lineHeight: 1.5 }}>
                {fejl}
              </p>
            )}
            {beskedOk && (
              <p data-testid="podcast-ok" style={{ margin: 0, color: "#0d7a5f", fontSize: ".78rem" }}>{beskedOk}</p>
            )}

            <Link href="/admin/podcast?fane=afsnit" data-testid="podcast-tilbage" style={{ fontSize: ".75rem", color: "var(--muted-foreground)" }}>
              {t("tools.podcast.allEpisodes")}
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
