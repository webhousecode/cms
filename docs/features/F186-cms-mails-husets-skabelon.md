# F186 — CMS-mails får husets skabelon

## Hvad Christian bad om

> «Lav CMS-skabelonen ud fra vn-lekers til både cms og broberg.ai» (3. september 2026)

Foranlediget af hans eget spørgsmål en time før: *«Har broberg.ai en standard mail skabelon der anvendes til at sende mails ud eller har vi slet ikke rørt det område?»*

## Målt før der blev besluttet noget

**broberg.ai har ingen egen skabelon.** Kontaktformularen sender til CMS'ets formular-motor på webhouse.app (`POST /api/forms/contact?site=broberg-ai`), og den er i drift — prøvet med en negativ kontrol, så svaret kan skelnes fra en formular der ikke findes:

```
/api/forms/contact?site=broberg-ai        400  «Verification failed»   ← findes, Turnstile-gate
/api/forms/findes-ikke-xyzzy?site=...     404  «Form not found»        ← kontrol
```

Motoren sender to breve: en **notifikation** til ejeren og et **auto-svar** til afsenderen. Begge bygges af en håndskrevet HTML-tabel i `lib/forms/notify.ts`, tematiseret af tre værdier fra site-config:

```
emailAccentColor    #00b2ff
emailFromName       broberg.ai
emailFooterName     broberg.ai
logo                INGEN — skabelonen har ikke et billed-element overhovedet
```

Og i cardmems mail-skabelon-flade (F298):

```
vn-leker        2 skabeloner   (enduser + internal, 7 hhv. 3 versioner)
broberg-ai-site 0
cms             0
```

## Hvorfor vn-lekers og ikke en ny

vn-leker byggede den samme dag på **`@broberg/mail-core`** (0.7.0) — husets delte mail-skal. Deres egen kommentar bemærker at de først byggede **kopi nummer tre** af det lag uden at vide at det fandtes, og reglen de kom ud med:

> SPØRG KATALOGEN OM KAPABILITETEN, ikke pakken om dens exports.

At bygge en fjerde kopi her ville være nøjagtig den fejl. Vi genbruger skallen.

**Og det afgørende designtræk er allerede taget hos dem:** brandet er et ARGUMENT, ikke en konstant. Første udgave hardkodede WebHouse-logoet, og Christian rettede det — mailen bærer AFSENDERENS identitet, og afsenderen er ikke altid os. Det er præcis det CMS'et har brug for: én skal, et brand pr. site.

## Scope

### 1. Brands, læst fra site-config — ikke hardkodet
Et `BROBERG_AI`-brand og et `WEBHOUSE`-brand, og en resolver der bygger brandet af det SITE mailen sendes for. Farve, mærke og fodtekst findes allerede som felter i site-config; de skal bare bruges.

### 2. Formular-notifikation + auto-svar gennem skallen
De to breve CMS'et faktisk sender i dag. `notify.ts`' håndskrevne tabel erstattes.

### 3. Invitationsmailen med
`renderInviteEmail` i `lib/email.ts` er også kundevendt og har sin egen håndskrevne HTML.

### 4. Registrer i cardmem for begge projekter
`cms` og `broberg-ai-site`, begge publikummer.

## Non-goals

- **Sannes 19 skabeloner.** De ligger i hendes eget repo med hendes egne tekster; de røres ikke herfra.
- **Nye mailtyper.** Dette kort skifter FORMEN på de breve der allerede sendes.
- **Teksterne selv.** Ordlyden er uændret hvor den kan være det; det er skallen der skiftes.

## Risiko, og hvorfor den er reel

`notify.ts` sender for **hvert** site CMS'et driver — sanneandersen, webhouse-site, broberg-ai. En fejl her rammer alle tre på én gang, og en mail kan ikke kaldes tilbage.

Derfor: **ingen tekst ændres i samme ombæring som formen**, og skabelonen skal renderes og SES før den sendes — ikke kun typecheckes.

## Reuse

- **`@broberg/mail-core` 0.7.0** — skallen. Ingen egen HTML-tabel.
- **`@broberg/mail`** — afsendelsen, allerede i brug via `lib/mailer.ts`.
- **vn-lekers `byg()`** — mønstret for hvordan felter bliver til afsnit. Kopieres som mønster, ikke som fil: deres ligger i deres repo og skal ikke importeres på tværs.
- Mangler skallen noget, **udvides den hos `components`** frem for at blive omgået her. Det er hele grunden til at den findes.
