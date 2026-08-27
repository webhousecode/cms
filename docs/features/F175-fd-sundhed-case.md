# F175 — FD Sundhed-casen på broberg.ai

**Status:** i gang
**Bestilt af:** Christian, 27. august 2026 — *"der skal laves en helt ny case og den skal være vild og blodig"*

---

## Hvorfor

Han søgte `fd sundhed` på broberg.ai og fik **No matches**. Der ligger to sider
om fysio-projekterne (`fysio-dk-sport`, `fysio-dk-aalborg`), men ingen case om
FD Sundhed. Det er det tungeste forløb i hele universet, og det er usynligt på
det site hvis opgave er at sælge på netop den slags.

## Materialet — hvad casen bygger på

Læst før der blev skrevet: det levende site (`sundhed.fdaalborg.dk`), begge
guide-forløb, og repoets egne dokumenter (125 feature-docs, status pr. 25/8,
integrationskorrespondancen med Complimenta).

De tal og kendsgerninger casen hviler på:

| | |
|---|---|
| Kunde | FysioDanmark Aalborg, for **Aalborg Kommunes** ansatte |
| Skala | **16.838** medarbejdere importeret |
| Flader | PWA + native iOS (App Store) + native Android (Google Play), én kodebase via Capacitor |
| Booking | **Complimenta** (CGM) via OAuth2 client-credentials — kalender, behandlere, ydelser, opret + annullér booking, opret client med CPR |
| Fakturering | Opkald.ai, EAN-nummer høstet fra lederens profil |
| Roller | medarbejder · leder (flere arbejdspladser, vælger EAN-kasse) · behandler · admin |
| Data | helbredsoplysninger (GDPR art. 9), CPR krypteret, RLS, revisionsspor |
| Stack | Next.js App Router, TypeScript, Tailwind, shadcn/ui, Supabase, Capacitor, Fly.io |

## Vinklen

Ikke "vi byggede en app". Den værdi der er svær at kopiere er at løsningen
**skriver sig ind mellem systemer der allerede findes** — kommunens
medarbejderkartotek, klinikkens booking-system, og et faktureringsled — uden at
nogen af dem blev skiftet ud. Og at den håndterer den mest følsomme datatype der
findes uden at sende et personnummer ud af huset.

Den dramatiske del er ÆGTE og skal ikke opfindes: 16.838 mennesker, CPR,
helbredsdata, en leder der skal sige ja inden for et døgn, og en booking der
lander i en fremmed kalender.

## Ikke i scope

- Ændringer på selve fd-sundhed-produktet.
- Søgefunktionen på broberg.ai (den leder kun i titler — egen sag).
- Fortrolige detaljer: navne på kommunale kontaktpersoner, mailadresser,
  nøgler, og alt om kommunens interne beslutningsproces. En offentlig case
  fortæller hvad der blev bygget, ikke hvem der sagde hvad i en mailtråd.
