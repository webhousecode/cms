# F182 — slugJob: en ny artikel beder selv om sin illustration

**Christian, 1. september 2026:**

> Hver gang der produceres et nyt slug så kaldes der et script der laver
> illustrationen/animationen.

> slugJob (bor i webhouse.app) — kalder et webhook med opgaven — så den kan komme
> hele vejen ind i din session som en intercom, da den skal bygges på $0-planen.

## Hvorfor mekanismen er rigtig

cms-admin **kan ikke selv tegne**. En SVG der skal ramme artiklens idé kræver en
model der har læst artiklen og kender husets visuelle sprog — og det ville være et
målt API-kald pr. artikel.

Men cms-admin **kan bede nogen om det**. En cc-session der allerede kører, koster
nul ekstra: den er Christians abonnement, ikke en regning pr. token. Derfor er
vejen webhook → intercom → session, og ikke et AI-kald inde i cms-admin.

## Hvad der er svært, og hvorfor et slug ikke rækker

`.claude/skills/news-illustration.md` sætter selv barren:

> the illustration should make someone say «oh, that's exactly what the article is
> about», not «that's a nice abstract blob»

De 12 flagskibstegninger nailer hver en konkret idé — cardmems er den bogstavelige
Idé→Plan→Board→Build→QA→Live-løkke, upmetrics' er et hjerteslag med ét orange
udslag.

**Et slug er 3–5 ord og kan ikke bære den bar.** Opgaven skal derfor bære
**artiklens tekst**, ikke kun dens navn. Det er forskellen på en tegning og en
dekoration, og det er hele grunden til at feature'en er værd at bygge frem for
bare at udvide staffage-puljen.

## Arkitektur

```
  ny artikel oprettes i cms-admin
        ↓  (kun når sitet har slået det til, og kun for samlinger der har illustrationer)
  slugJob lægges i en KØ hos cms-admin      ← køen er kilden, ikke beskeden
        ↓  webhook
  buddys offentlige relæ
        ↓  intercom
  en kørende cc-session tegner  →  Illustrations.tsx  →  commit + deploy
```

### KØEN er kilden, intercom'en er kun et puf

Første udkast lod hver artikel fyre sin egen besked. Det er forkert af to grunde:

1. **En session der er midt i noget andet bliver afbrudt** én gang pr. artikel.
2. **En tabt besked er en tabt opgave.** Er beskeden det eneste sted opgaven
   findes, forsvinder den hvis leveringen fejler — og en mislykket levering ligner
   en lykkedes, hvilket er husets gennemgående fejlform.

Derfor: opgaven skrives i en kø hos cms-admin **først**, og intercom'en siger kun
«der ligger N tegneopgaver». Forsvinder pufet, står opgaven der stadig og bliver
taget næste gang nogen kigger. Beskeden må gerne gå tabt; opgaven må ikke.

### Ship dark

Uden webhook-URL og nøgle sker der **ingenting** — ingen fejl, ingen halvvirkende
flade. Køen fyldes stadig, så en senere opkobling ikke starter tomhændet.

## Åbne spørgsmål (stillet til buddy, intercom #24837)

1. Hvilken **offentlig URL** skal en Fly-app POSTe til for at nå en navngiven
   session? buddy kører lokalt på :7474 og kan ikke nås fra Fly; `buddycloud.cc`
   er relæet.
2. **Auth** — hvilken header, og en nøgle der helst kun kan SENDE.
3. **Offline-adfærd** — dækket af F177-telefonsvareren, eller tabes opgaven?
4. **Kvittering** — kan jeg skelne «køet» fra «leveret» fra «forsvandt»? Deres egen
   F243.1 handlede om netop dette: en manglende kvittering blev renderet som tom
   streng bag en succes-tekst.

Indtil svaret findes, bygges køen og udløseren — de er uafhængige af relæets form.

## Non-goals

- **Ingen automatisk udgivelse af tegningen.** Sessionen laver den, et menneske
  ser den. En tegning der ser forkert ud er værre end en genbrugt der ser rigtig ud.
- **`FLAGSHIP_STAFFAGE_KEYS` røres ikke.** Listen er bevidst fast, så en bespoke
  tegning aldrig hash-vælges som fyld til en anden artikel.
- **Ikke alle samlinger.** Kun dem der faktisk viser en illustration.
