# F179 — Site info tog 2 minutter og 45 sekunder

**Status:** In progress
**Rapporteret:** Christian, 28. august 2026 — «Site info er latterligt langsom, det er der INGEN der gider vente på at se»

---

## Målingen, før noget blev rørt

Mod produktionen, ikke lokalt:

```
webhouse-site · quick-action "site-info"
  ttft   15,0 s
  TOTAL  165,2 s          ← 2 min 45
  tegn   7013
  tok/s  12,5             ← helt normal skrivehastighed
  10 værktøjskald: site_summary, get_site_config, content_stats,
                   list_documents ×7   (én per samling)
```

**Modellen var ikke langsom.** ~145 af de 165 sekunder gik med de ni rundture mellem værktøjskaldene. Hver rundtur sender hele værktøjsbeskrivelsen (~8.300 tokens) plus den voksende historik af sted igen.

Kontrolmålinger samme aften, samme endpoint:

| spørgsmål | værktøjskald | total |
|---|---|---|
| «Sig hej» | 0 | 5,3 s |
| 60 ord om dokumentation | 0 | 30,0 s |
| «Hvor mange dokumenter?» | 1 | 19,7 s |
| **Site info** | **10** | **165,2 s** |

Og samme skanning blev gentaget hele vejen: `site_summary` gik alle samlinger igennem, `content_stats` gik dem igennem igen, og `list_documents` gik hver enkelt igennem en tredje gang — de samme læsninger, ni gange, med et modelkald imellem hver.

## Det var ikke motorskiftet

Christian spurgte direkte om det var @broberg/chat-skiftet fra samme dag. Målt svar: **nej.**

- Skrivehastigheden er 12,5 tok/s — normal.
- trail-sitets gemte Site info-svar fra **23. august** (før skiftet) er 9265 tegn — samme svar-form og -størrelse som i dag.
- broberg.ai fik sit Site info-svar gemt **kl. 10:36 samme dag**, altså efter skiftet.

## Hvorfor han overhovedet ventede — den egentlige fejl

Site info er en **cachet** quick-action (F158). Den skal være øjeblikkelig. Målt tilstand på prod:

```
webhouse-site   site-info   MANGLER HELT i cachen
sanneandersen   site-info   MANGLER HELT
broberg-ai      site-info   gemt 10:36, men markeret forældet
```

Opvarmningen har `CHAT_TIMEOUT_MS = 180_000`. Svaret tager **165 s**. Den ligger på kanten — og på de to største sites nåede den aldrig i mål.

**Og fejlen var usynlig.** `generateQuickAnswer` havde fem forskellige fejlveje der alle returnerede et bart `false`:

1. chat svarede ikke-OK
2. strømmen indeholdt ingen tekst
3. gemningen fejlede
4. **timeout/abort** ← den der ramte
5. slukket kilde / ukendt nøgle

Ingen af dem skrev noget nogen steder. **Det eneste symptom et menneske kunne observere, var at en knap var langsom.** Dagens gennemgående fejlform, én gang til: noget manglende degraderer til noget der ikke ser manglende ud.

Bemærk retningen: jo mere indhold et site har, jo langsommere er svaret, jo sikrere er det at opvarmningen fejler — så **knappen er permanent kold præcis på de sites hvor den betyder mest.**

## Rettelsen

**1. `site_summary` svarer nu på hele spørgsmålet i ét kald.** Fra én skanning af samlingerne returnerer den nu også felter per samling, indholdsstatistik, indstillinger og et par rigtige dokumenttitler. Beskrivelsen siger eksplicit at den ikke skal følges op af `list_documents`/`content_stats`/`get_site_config`.

Intet er fjernet — de tre separate værktøjer består til målrettet brug. Pointen er at modellen ikke længere har nogen grund til at gennemgå samlingerne i hånden.

Output er **bevidst afgrænset** (25 felter, 5 titler per samling): et værktøjssvar sendes med i næste forespørgsel, så en ubegrænset opsummering bytter rundture for promptstørrelse og vinder ingenting.

**2. Opvarmningen siger hvad der gik galt.** Hver af de fem veje navngiver sig selv i loggen med site, nøgle og forløbet tid. En timeout siger *at* den er en timeout **og hvilken grænse** — uden tallet skal næste læser grep'e efter en konstant. Den kaster stadig aldrig.

## Bevis

- `quick-prewarm-reports-failure.test.ts` — 5 tests. Mutations-bevist: erstattes `fail()` med et tavst `return false`, går **4 af 5 røde**. Den femte er success-testen, som kræver **tavshed** — uden den ville «log på hver vej» bestå alle de andre og gøre loggen ubrugelig.
- Slutmåling mod produktion efter udrulning: se nedenfor.

## Afgrænsning

**Ikke med:** at hæve timeout-grænsen (det behandler symptomet), at ændre selve quick-action-prompten, at bygge et ikke-agentisk site-info-svar uden om modellen. Hvis 20 s stadig er for langt, er dét næste kort — men så træffes den beslutning på en måling, ikke på en fornemmelse.

---

## Slutmåling — mod produktion, efter udrulning (`56415aa`)

```
webhouse-site · quick-action "site-info"
  ttft   2,8 s      (var 15,0)
  TOTAL  34,1 s     (var 165,2)
  tok/s  54,4       (var 12,5)
  1 værktøjskald: site_summary      (var 10)
```

**Klikket, som det opleves — cachen varm:**

| site | svar | klik |
|---|---|---|
| webhouse-site | 7002 tegn | 108 / 24 / 24 ms |
| sanneandersen | 11853 tegn | 19 / 25 / 20 ms |
| broberg-ai | 5255 tegn | 20 / 27 / 30 ms |

**165 sekunder → ~25 millisekunder.**

**Og opvarmningen når nu i mål**, hvilket den aldrig havde gjort på de to største sites:

```
 20s   broberg-ai      VARM  5255 tegn
 40s   webhouse-site   VARM  7002 tegn   ← havde aldrig været varm
 60s   sanneandersen   VARM 11853 tegn   ← havde aldrig været varm
```

Bemærk at retningen er vendt: det største site (sanneandersen, 11853 tegn) er nu også varmt. Før var det omvendt — jo mere indhold, jo sikrere fejlede opvarmningen.

Skrivehastigheden steg fra 12,5 til 54,4 tok/s. Det er ikke en hurtigere model: svaret skrives nu i ét stræk i stedet for at blive afbrudt af ni rundture.

### Det ene acceptkriterium der IKKE er opfyldt

AC lød «under 30 sekunder og højst 3 værktøjskald».

- værktøjskald: **1** ✓
- tid: **34,1 s** ✗ — **4 sekunder over min egen streg.**

Grænsen var sat af mig, ikke af Christian, og den betyder intet i praksis: han rammer cachen og venter 25 ms. Men de 34 sekunder er reelle første gang efter et deploy, og de skrives som de er frem for som «cirka 30». Vil man under 30, er næste skridt at bygge site-info-svaret uden om modellen helt — det er en anden beslutning, truffet på dette tal.

Kortet lukkes på Christians ordre med den afvigelse noteret.
