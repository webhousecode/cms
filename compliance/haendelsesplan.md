# Plan for sikkerhedshændelser

**Web House ApS · CVR 21221198** · gælder alle produkter under broberg.ai og webhouse.app
Version 1 · 27. september 2026 · ejer: Christian Broberg (cb@webhouse.dk)

Planen svarer på tre spørgsmål: **hvordan opdager vi det, hvem gør hvad, og hvem skal have besked hvornår.** Den er skrevet så den kan følges klokken tre om natten af en person, der ikke har læst den før.

---

## 1. Hvad er en sikkerhedshændelse?

Alt, der kan betyde, at persondata eller vores systemer er blevet **set, ændret, slettet eller gjort utilgængelige** af nogen, der ikke må. Eksempler:

- En nøgle eller adgangskode er lækket (i kode, i en log, i en chat, sendt til forkert person).
- En kunde kan se en anden kundes data.
- En server, database eller et backup-lager er tilgået af en uvedkommende.
- Data er slettet eller ødelagt, og vi kan ikke gendanne dem.
- En mail med persondata er sendt til den forkerte modtager.
- En leverandør (se listen på broberg.ai/trust) melder om brud hos dem, der rører vores data.

**Er du i tvivl, så er det en hændelse.** Det koster ti minutter at lukke en falsk alarm. Det koster tillid at opdage en rigtig for sent.

## 2. Hvordan vi opdager den

| Kilde | Hvad den fanger |
|---|---|
| **Upmetrics** | Fejl, nedbrud, mislykkede kald og usædvanlige mønstre i alle apps |
| **Sikkerhedsscanning ved hver ændring** (Gitleaks + egen scanner) | Nøgler og adgangskoder på vej ind i kildekoden |
| **Leverandørernes egne advarsler** | Mails fra Fly.io, Cloudflare, Supabase, GitHub, Google m.fl. om brud eller mistænkelig adgang |
| **Kunder og brugere** | Henvendelser til security@broberg.ai eller support |
| **Udefra** | Sikkerhedsforskere via security@broberg.ai og /.well-known/security.txt |

Alle henvendelser til security@broberg.ai skal besvares inden for én arbejdsdag, også når svaret kun er "modtaget, vi ser på det".

## 3. Hvem gør hvad

| Rolle | Hvem | Ansvar |
|---|---|---|
| **Hændelsesansvarlig** | Christian Broberg | Beslutter alvorlighed, godkender al udadgående kommunikation, anmelder til Datatilsynet |
| **Teknisk håndtering** | cc-sessionen, der ejer det ramte system (se cardmem) | Inddæmmer, undersøger, retter, dokumenterer |
| **Stedfortræder** | *Skal udpeges* | Overtager hvis Christian ikke kan nås inden for 4 timer |

En agent (cc-session) må altid **inddæmme** med det samme — rotere en nøgle, spærre en konto, slå en funktion fra — uden at vente. En agent må **aldrig** selv kontakte kunder, Datatilsynet eller offentligheden. Den kommunikation går altid gennem Christian.

## 4. Alvorlighed

| Niveau | Beskrivelse | Eksempel | Reaktion |
|---|---|---|---|
| **Kritisk** | Persondata er eller kan være kommet ud, eller helbredsdata er berørt | Kunde A kan læse kunde B's data; databasenøgle lækket offentligt | Straks, døgnet rundt |
| **Høj** | Risiko for adgang til persondata, men intet tyder på at det er sket | Nøgle lækket i privat repo; sårbarhed fundet, ikke udnyttet | Samme dag |
| **Lav** | Ingen persondata berørt | Nedbrud uden datatab; nøgle til internt værktøj lækket | Næste arbejdsdag |

## 5. Trin for trin

### Trin 1 · Inddæm (første time)
Stop skaden før du forstår den. Rotér den lækkede nøgle (Fly-secrets, cardmem-vault), spær kontoen, sluk funktionen, luk adgangen. **Slet ikke logfiler eller data** — de er beviser.

### Trin 2 · Registrér (med det samme)
Opret et kort i cardmem med mærket `sikkerhedshændelse`. Skriv tidspunktet for **opdagelsen** i dansk tid — det er det tidspunkt, 72-timersfristen regnes fra. Alt, der sker herefter, logges på kortet med tidspunkt.

### Trin 3 · Vurdér (inden for 24 timer)
Find ud af: Hvilke data? Hvor mange personer? Hvilke kunder? Hvor længe har hullet stået åbent? Er helbredsdata berørt? Vurdér derefter **risikoen for de berørte personer** — ikke for os.

### Trin 4 · Giv besked
Se afsnit 6. Fristerne løber, mens vi undersøger. En foreløbig anmeldelse, der senere suppleres, er bedre end en fuldstændig, der kommer for sent.

### Trin 5 · Ret
Luk årsagen, ikke kun symptomet. Rettelsen får en automatisk test, der fejler, hvis hullet åbner sig igen.

### Trin 6 · Evaluér (inden for 14 dage)
Kort skriftlig gennemgang: hvad skete, hvorfor opdagede vi det ikke før, hvad ændrer vi. Gemmes på kortet og i Trail.

## 6. Hvem skal have besked, og hvornår

Vores rolle afgør, hvem vi skal underrette.

### Når vi er **databehandler** (vi behandler data for en kunde, fx FD Aalborg eller en CMS-kunde)
- **Kunden** (den dataansvarlige) skal have besked **uden unødig forsinkelse** — vores mål er **inden for 24 timer** efter opdagelsen, så kunden selv kan nå sin 72-timersfrist.
- Det er kunden, der anmelder til Datatilsynet og underretter de berørte personer. Vi hjælper med alle oplysninger.

### Når vi er **dataansvarlig** (vores egne brugere, fx Broberg ID-konti og broberg.ai-henvendelser)
- **Datatilsynet** skal have en anmeldelse **inden for 72 timer** efter opdagelsen, medmindre bruddet med stor sandsynlighed ikke indebærer en risiko for personerne. Anmeldelse sker via Datatilsynets formular på datatilsynet.dk ("Anmeld brud på persondatasikkerheden").
- **De berørte personer** skal underrettes direkte, hvis bruddet sandsynligvis indebærer **høj risiko** for dem — altid ved helbredsdata, adgangskoder eller betalingsoplysninger.

### Altid
- **Leverandører**, hvis bruddet stammer fra eller berører dem.
- Beskeden indeholder: hvad der er sket, hvilke data, hvad vi har gjort, hvad modtageren bør gøre, og hvem de kan kontakte.

## 7. Dokumentation

**Alle brud dokumenteres — også dem, der ikke skal anmeldes** (GDPR art. 33, stk. 5). Cardmem-kortet med mærket `sikkerhedshændelse` er vores fortegnelse. Det indeholder: tidspunkt for opdagelse, hvad der skete, hvilke data og personer, vurderingen af risiko, hvem der fik besked og hvornår, og hvad der blev rettet. Hvis vi beslutter **ikke** at anmelde, skrives begrundelsen på kortet.

## 8. Øvelse og vedligehold

- **Én gang om året** gennemspiller vi en tænkt hændelse (fx "en databasenøgle ligger i et offentligt repo"). Resultatet gemmes som et kort.
- Planen gennemgås efter hver rigtig hændelse og mindst én gang om året.
- Kontaktlisten nedenfor holdes opdateret.

## 9. Kontakter

| Hvem | Hvordan |
|---|---|
| Hændelsesansvarlig | Christian Broberg · cb@webhouse.dk |
| Sikkerhedshenvendelser udefra | security@broberg.ai |
| Datatilsynet | datatilsynet.dk → Anmeld brud på persondatasikkerheden |
| Leverandører | Se listen over underdatabehandlere, broberg.ai/trust |

---

## Åbent før planen er "på plads"
1. **Stedfortræder** er ikke udpeget.
2. **Kunder vi er databehandler for**: der skal ligge en liste med kontaktperson pr. kunde, så trin 4 ikke starter med at lede efter en mailadresse. Hænger sammen med spørgsmålet om databehandleraftalen med FD Aalborg.
3. **security.txt** er ikke publiceret endnu (F201.4).
4. **Første øvelse** er ikke holdt.
