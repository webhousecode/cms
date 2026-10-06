# Øvelse 1 — «Nøglen i det offentlige repo»

**UDKAST til Christians gennemgang** · skrevet 6. oktober 2026 · hører til F201.6 og `haendelsesplan.md` afsnit 8

> **ØVELSE. Intet af det nedenfor er sket.** Ingen nøgle roteres, ingen kunde kontaktes, intet anmeldes. Alle navne på systemer er rigtige, så øvelsen tester vores rigtige opsætning; selve hændelsen er opdigtet.

---

## Hvorfor netop dette scenarie

Det rammer begge veje i planen på én gang:

- **FD Sundhed** rummer helbredsdata, og der er vi **databehandler** for FD Aalborg → besked til kunden inden for 24 timer.
- **Broberg ID** er vores egne brugere, og der er vi **dataansvarlig** → Datatilsynet inden for 72 timer.

Og det sker på et tidspunkt hvor Christian ikke kan nås — så reglen «ingen stedfortræder, agenterne inddæmmer, ingen taler udad» bliver prøvet af.

## Sådan holdes øvelsen

| | |
|---|---|
| **Varighed** | 60–90 minutter |
| **Deltagere** | Christian (hændelsesansvarlig) · fd-sundhed-sessionen og broberg-id-sessionen (teknisk håndtering) · cms (ordstyrer, fører tid og noter) |
| **Form** | Ordstyreren læser ét «indspil» ad gangen. Deltagerne svarer hvad de ville gøre og slår op i planen. Agenterne **beskriver** handlingen, de udfører den ikke. |
| **Ur** | Øvelsens ur er fiktivt og står i dansk tid. Opdagelsen sker lørdag kl. 02:40. |
| **Resultat** | Gemmes som cardmem-kort mærket `sikkerhedshændelse` + `øvelse`, med evalueringen fra afsnit 6 nedenfor. |

---

## Indspil

### Indspil 1 · lørdag kl. 02:40 — opdagelsen

En sikkerhedsforsker skriver til security@broberg.ai:

> «I et offentligt GitHub-repo (en gammel kopi af et testprojekt) ligger en `.env`-fil. Den indeholder noget der ligner en Supabase `service_role`-nøgle og en `BID_CLIENT_SECRET`. Filen blev lagt op for 9 dage siden. Jeg har ikke brugt nøglerne.»

**Spørgsmål til deltagerne**
1. Hvem læser denne mail kl. 02:40 en lørdag? Hvordan bliver den til en opgave hos en agent?
2. Er det en hændelse? Hvilket niveau?
3. Hvilket klokkeslæt løber fristerne fra?

**Forventet svar efter planen**
- Ja, det er en hændelse (afsnit 1: «en nøgle er lækket»). **Kritisk** — en databasenøgle til et system med helbredsdata, lækket offentligt (afsnit 4).
- Fristerne regnes fra **02:40 lørdag** — opdagelsen, ikke fra da filen blev lagt op (trin 2).

**Det vi tester:** om der overhovedet er nogen, menneske eller agent, der ser en mail til security@broberg.ai inden for timer. *Svaret kendes ikke i dag — det skal øvelsen finde ud af.*

---

### Indspil 2 · kl. 03:05 — Christian kan ikke nås

Christian sover med telefonen på lydløs. Der kommer intet svar før kl. 08:30.

**Spørgsmål**
1. Hvad må agenterne gøre nu, uden Christian?
2. Hvad må de **ikke** gøre?

**Forventet svar**
- Inddæmme med det samme (afsnit 3 + trin 1): fd-sundhed roterer Supabase-nøglen, broberg-id roterer `BID_CLIENT_SECRET`, nye værdier i Fly-secrets og cardmem-vault. Logfiler røres ikke — de er beviser.
- Registrere: kort i cardmem med mærket `sikkerhedshændelse`, opdaget kl. 02:40 (trin 2).
- **Ikke** skrive til FD Aalborg, Datatilsynet, forskeren eller nogen anden udenfor. Det venter på Christian.

**Det vi tester:** at «ingen stedfortræder» er en regel man kan følge kl. 03, og ikke bare en tom celle i en tabel.

---

### Indspil 3 · kl. 05:30 — loggen viser et fremmed opslag

fd-sundhed gennemgår Supabase-loggen og finder: torsdag kl. 21:14 har en ukendt IP-adresse brugt den lækkede nøgle til at læse tabellen med ansøgninger — **38 rækker**, med navne og helbredsoplysninger på 31 medarbejdere hos FD Aalborg.

broberg-id finder **ingen** brug af `BID_CLIENT_SECRET` udefra.

**Spørgsmål**
1. Ændrer det niveauet?
2. Hvem skal have besked, inden for hvilken frist?
3. Skal Broberg ID-delen anmeldes til Datatilsynet, når nøglen ikke er brugt?

**Forventet svar**
- Niveauet er fortsat **Kritisk** — nu er data faktisk set af en uvedkommende, og det er helbredsdata.
- **FD Aalborg** (Morten Skjoldager) skal have besked inden for **24 timer**, dvs. senest **søndag kl. 02:40**. Det er FD Aalborg der anmelder til Datatilsynet og underretter de 31 medarbejdere; vi leverer alle oplysninger (afsnit 6, databehandler).
- **Broberg ID:** vi er dataansvarlige. Nøglen er lækket, men intet tyder på brug, og den er roteret → risikoen for personerne er sandsynligvis lav, så der skal **formentlig ikke** anmeldes. Men beslutningen og begrundelsen **skal skrives på kortet** (afsnit 7, art. 33 stk. 5). Det er Christians beslutning, ikke agentens.

**Det vi tester:** at deltagerne skelner mellem de to roller og ikke anmelder det hele samme vej.

---

### Indspil 4 · kl. 08:30 — Christian vågner

Christian ser kortet. Han skal skrive til FD Aalborg.

**Spørgsmål**
1. Hvor finder han Mortens mail eller telefonnummer?
2. Hvad skal der stå i beskeden?
3. Hvor ligger udkastet, mens han læser det?

**Forventet svar**
- Kontakten står i planens afsnit 10. **I dag står der «mangler».** Det er et hul, øvelsen vil ramme.
- Beskeden indeholder (afsnit 6): hvad der er sket, hvilke data, hvad vi har gjort, hvad FD Aalborg bør gøre, hvem de kontakter.
- Udkastet skrives af en agent i cardmem (Assets → Comms) og sendes først på Christians eget ord, med kopi til cb@webhouse.dk.

---

### Indspil 5 · mandag — afslutning

Rettelse og eftertanke.

**Spørgsmål**
1. Hvad er den egentlige årsag — ikke «en fil lå offentligt», men hvorfor kunne den det?
2. Hvilken automatisk test eller spærre gør at det ikke kan ske igen (trin 5)?
3. Hvorfor opdagede vores egen scanning det ikke selv (trin 6)?

**Forventet retning**
- Gitleaks scanner kun ændringer i vores egne repoer. En kopi i et andet repo, eller en fil lagt op uden om vores hooks, ser den aldrig. Mulig rettelse: GitHubs egen secret scanning slået til på alle konti + periodisk søgning efter vores nøgle-præfikser.

---

## Huller vi forventer at finde

Kendt allerede inden øvelsen — øvelsen skal bekræfte dem og vise hvad de koster:

| Hul | Hvor i planen | Konsekvens i scenariet |
|---|---|---|
| Ingen kontaktoplysninger på FD Aalborg og Sanne Andersen | afsnit 10 | Christian skal lede efter Mortens kontakt mens 24-timersfristen løber |
| security.txt er ikke publiceret (F201.4) | afsnit 2 | Forskeren skal gætte hvor han skal skrive |
| Ingen stedfortræder | afsnit 3 | 6 timer uden nogen der kan tale udad |
| **Ukendt:** hvem ser security@broberg.ai om natten? | afsnit 2 | Kan være timer eller dage før nogen opdager mailen |
| Backup uden for Fly er ikke bygget (F201.5) | — | Ikke ramt her, men et scenarie med slettede data ville ramme det |

## Evaluering (udfyldes efter øvelsen)

- Hvad gik som planen sagde?
- Hvor måtte vi improvisere?
- Hvilke rettelser i planen? (hver får en dato og et kort)
- Hvornår holdes næste øvelse?

---

## Spørgsmål til Christian før øvelsen

1. Er scenariet rigtigt at starte med — eller vil du hellere øve noget andet først (fx «kunde A kan se kunde B's data»)?
2. Planen siger at første øvelse holdes **når backup er testet og alt andet er grønt** (din beslutning 27/9). Skal det stadig gælde, eller må øvelsen holdes før F201.5?
3. Er det i orden at fd-sundhed- og broberg-id-sessionerne deltager som «teknisk håndtering»?
