# F192 — to prøver er røde under belastning og grønne alene

> **Status 8. september 2026 · fundet, ikke rettet.**

## Hvad der blev målt

Under en fuld kørsel af cms-admins suite (1.774 prøver, 139 filer parallelt):

```
FAIL  run-fly-ephemeral.test.ts  > falls back to FLY_API_TOKEN env when configToken empty
FAIL  site-pool-cache.test.ts    > returns the NEW config after cms.config.ts changes on disk
```

Kørt igen — kun de to filer, uden andet ved siden af:

```
2 passed · 9 tests passed
```

Så de er ikke i stykker. De er **afhængige af hvad der ellers kører samtidig**.

## Hvorfor det er værd at rette

En prøve der er rød af og til er værre end en der er rød hele tiden. Huset har
allerede reglen: *«Bevæg dig aldrig forbi porten»*. En port der blinker rødt
uden grund lærer den næste at trykke igen — og så er porten væk uden at nogen
har slukket den.

Det ramte i dag: jeg måtte køre suiten to gange for at kunne sige om et bump af
`@upmetrics/sdk` havde brudt noget. Svaret var nej, men jeg kunne ikke se det
på første kørsel.

## De to mistanker (ikke bekræftet)

1. **`run-fly-ephemeral`** hedder «falls back to FLY_API_TOKEN **env**». En prøve
   der sætter en miljøvariabel deler den med hver anden prøve i samme proces.
   Det er nøjagtigt den fejlform repoets egen hårde regel forbyder i
   request-handlere — her bare i en prøve, hvor den ikke er dækket af reglen.
2. **`site-pool-cache`** hviler på fil-mtime. Under belastning kan to skrivninger
   lande i samme mtime-tick, og cachen ser så ingen ændring.

Begge er gæt indtil de er målt. **Bekræft mekanismen før der rettes** — en
«rettelse» der bare gør prøven mindre følsom er den værste udgang: så er porten
stadig blind, og den ser grøn ud.

## Acceptkriterier

- Mekanismen bag HVER af de to er navngivet med en måling, ikke en formodning.
- Suiten kører 5 gange i træk, fuldt parallelt, uden en eneste rød.
- Rettelsen gør prøverne mere præcise, ikke mere tålmodige: en `sleep` eller et
  hævet timeout er ikke en løsning her.
- Sætter en prøve en miljøvariabel, gør den det isoleret (eller slet ikke).
