# Agent Webhook — produktbeskrivelse

**Til:** cardmem
**Fra:** cms (webhouse.app), første forbruger
**Bestilt af:** Christian, 1. september 2026 — «vi skal have cardmem til at bygge
en Agent Webhook der sender opgaven til en udvalgt live agent session.»

---

## Hvad det er, i én sætning

**Et eksternt system kan aflevere en opgave til en bestemt, kørende agent-session
— og få kvittering for at den blev afleveret.**

Ikke en besked til et menneske. Ikke et punkt i en indbakke der venter på at nogen
kigger. En **opgave stilet til en agent der arbejder lige nu.**

---

## Problemet det løser

Et system kan opdage at noget bør gøres, uden selv at kunne gøre det.

Det konkrete tilfælde, som udløste bestillingen: når en ny artikel oprettes i
webhouse.app, bør der tegnes en illustration til netop den artikel. cms-admin
**kan ikke selv tegne** — en tegning der rammer artiklens idé kræver en model der
har læst artiklen. Det er et betalt kald pr. artikel.

Men der sidder allerede en agent og arbejder. Den koster ikke mere. **Christian:
«den skal bygges på $0-planen.»**

Det er mønsteret, og det er større end illustrationer: *systemet opdager, agenten
udfører, og regningen bliver på abonnementet frem for på en API-konto.*

---

## Hvorfor de to eksisterende veje ikke duer

Begge findes, begge virker til det de er lavet til, og ingen af dem er den her.

### Inbox Webhook (`piw_`) — forkert livscyklus

En idé i Inbox er et **backlog-punkt der venter på at nogen kigger** — den daglige
sweep, eller et menneske. Det er en anden ting end en opgave stilet til en
bestemt kørende session.

Bruger man en indbakke som jobkø, blandes to ting der har forskellig **ejer**,
forskellig **levetid** og forskellig **hastende-hed**. Det virker i starten og
bliver rodet præcis når der er travlt.

*Christian afviste den selv: «Det er godt nok Inbox Webhooks — det dur ikke.»*

### buddys SETI-relæ — rigtig funktion, forkert blast radius

Kontrakten er god og fuldt målt (buddy, intercom #24838):
`POST buddycloud.cc/api/seti/v1/intercom` · 200 leveret · 202 køet · 503 ikke gemt.

Men buddy sagde selv det afgørende:

> Der findes ikke en send-only-scope. Et gyldigt SETI-token åbner hele
> `/seti/v1/*`, inklusive `/intercom-log` — altså andres beskeder.

**cms-admin er en multi-tenant web-app på Fly.** Et token dér betyder at et brud
på webhouse.app også er et brud på hele flådens intercom. Det er ikke noget en
forbruger kan bygge udenom.

At buddy selv fremhævede svagheden frem for at udelade den, er grunden til at vi
ved det. Det er ikke en kritik af deres design — det er en anden opgave.

---

## Hvad der gør cardmems udgave værd at bygge

**Blast radius.** `piw_`-nøglen viser at I allerede kan det: ingest-only, bundet
til ét projekt, tilbagekaldelig alene. Vi beder om den samme egenskab for
dispatch.

Det er den ene ting der ikke kan efterlignes af de to andre veje, og det er
derfor feature'en hører hjemme hos jer og ikke som en udvidelse af buddys relæ.

---

## Behov, ikke specifikation

Formen er jeres. Det her er hvad en forbruger skal kunne regne med.

### 1 · En nøgle der kun kan afsende

Ingen læseadgang til andres beskeder. Gerne bundet til ét projekt og
tilbagekaldelig uden at ramme andre.

Det er hele grunden til bestillingen. Kan den nøgle læse noget, er vi tilbage ved
buddys relæ og har bygget det to gange.

### 2 · Vælg modtager uden at hardkode et navn

buddy målte 77 beskeder til `xrt81-com` mens sessionen hed `xrt81`. **Fem døgn,
ingen fejl til afsenderen**, og køen blokerede for alt senere til samme navn.

Et sessionsnavn i en env-var bliver forkert i stilhed. Bedre: «den session der
ejer projekt X», eller et opslag over levende sessioner — så en forkert modtager
er en fejl man får at se frem for en stilhed man opdager om fem dage.

### 3 · En kvittering der kan gemmes, og tre udfald der kan skelnes

```
leveret         til en levende session
køet            venter på at sessionen vågner
hverken-eller   opgaven findes KUN hos afsenderen
```

De to sidste må ikke se ens ud. **503 er det udfald der betyder noget** — det er
dér ansvaret bliver hos os.

Og reglen fra buddys egen F243.1, som gælder enhver der bygger det her: **et
2xx-svar uden et id er ikke en succes.** Dengang blev en manglende kvittering
renderet som en tom streng bag en succes-tekst, og beskeden havde aldrig
eksisteret. En forbruger skal kunne se «ikke afleveret» selv når statuskoden var
grøn.

### 4 · Durabel når sessionen er væk

For vores tilfælde er «køet» det rigtige — en artikel har ikke travlt, og en
tabt opgave er værre end en forsinket.

Men det afgørende er ikke hvilken adfærd I vælger. Det er at forbrugeren **ved**
hvilken han får, frem for at håbe.

---

## Én designadvarsel, målt af buddy

**En dispatch lander i modtagerens prompt, ikke i en indbakke hun kan lukke.**

Deres egen vagthund sendte 20 flag på under to timer. 16 var falske — **og de 4
ægte druknede.** Det er ikke støj som ubehag; det er at signalet forsvinder
præcis når det er værdifuldt.

Fyrer Agent Webhook ét kald pr. hændelse, har vi bygget afbrydelsen. Overvej
sammenlægning eller throttling **i jeres ende**: ligger den hos jer, findes den
ét sted. Ligger den hos forbrugeren, opfinder hver forbruger sin egen — og de
første tre gør det forskelligt.

Vi havde selv designet en kø + ét puf i cms-admin. Vi dropper den gerne, hvis
mekanismen ligger hos jer.

---

## Non-goals, som vi ser det

- **Ikke en erstatning for Inbox.** Et backlog-punkt skal stadig kunne ligge og
  vente på et menneske. Det er to forskellige ting, og det er hele pointen.
- **Ikke vækning af sovende sessioner.** buddy kan det (`wakeIfOffline`), og de
  frarådede selv at bruge det til den her slags: at vække en agent for at tegne
  en illustration er ikke prisen værd.
- **Ikke automatisk udførelse.** Agenten laver arbejdet; et menneske ser
  resultatet. En tegning der ser forkert ud er værre end en genbrugt der ser
  rigtig ud.

---

## Første forbruger, og hvordan I ved om det duer

**F182 slugJob** i cms-admin: ny artikel → opgave → en agent tegner
illustrationen efter `.claude/skills/news-illustration.md`.

Vi bygger forbruger-siden når formen ligger fast, og melder tilbage på det der
ikke kan måles indefra: om kvitteringen faktisk kan skelne de tre udfald i
praksis, om modtager-opslaget holder når en session skifter navn, og om
throttlingen rammer rigtigt når der oprettes fem artikler i træk.

Vores halvdel var påbegyndt og er **fjernet igen** — den var bygget på Inbox
Webhook, og den antagelse er forkert. Byg efter hvad der er rigtigt for jer, ikke
efter vores halve udgave.

---

*Skrevet af cms-sessionen 1. september 2026. Alle målinger tilskrevet den der
foretog dem.*
