# F196 — Et felt kan ikke fjernes fra et dokument

> **Fundet 11/9-2026** på broberg-ai-site, under oprydning efter mit eget fejlgreb.
> **Christians ord:** *«ja lav et kort på cms-api'et».*

## Hvad der skete

Jeg tilføjede feltet `ctaNote` til `sections/kontakt` og `sections/en-kontakt` på
broberg-ai. Bagefter viste det sig at komponenten der læser feltet renderes på
**nul sider**, så feltet skulle væk igen.

Det kunne det ikke:

```
PATCH /api/cms/sections/kontakt?site=broberg-ai   { data: {…uden ctaNote…} }
  → 200, og ctaNote står der stadig

PUT   /api/cms/sections/kontakt?site=broberg-ai
  → 405 Method Not Allowed
```

Feltet står i dag i begge dokumenter med værdien `""` — det tætteste man kommer
på en sletning.

## Hvorfor det er værd at rette

**Vores egen dokumentation siger det modsatte.** Repoets CLAUDE.md advarer
ordret om at *«PATCH erstatter `.data` helt → altid GET→flet→PATCH»*. Den regel
findes for at man ikke ved et uheld sletter felter. Målt opførsel er den
modsatte: PATCH **fletter**, og intet kan slettes. En agent der følger reglen får
altså et andet resultat end reglen lover — og opdager det kun hvis den læser
tilbage og sammenligner, hvilket er præcis det de færreste gør.

**Konsekvensen er ensrettet drift.** Hvert felt nogen nogensinde har skrevet til
et dokument bliver der for altid. Et skema kan skrumpe, en komponent kan
fjernes, en agent kan fortryde — dokumentet kan ikke. Over tid samler hvert
dokument på hvert site felter ingen kode læser, og ingen tør røre fordi man ikke
kan vide om de er døde.

**Og det rammer hårdest dem der rydder op.** En agent der opdager sin egen fejl
og vil gøre det godt igen, er den der løber ind i væggen. Den der bare lader
rodet ligge mærker ingenting.

## Åbne spørgsmål — skal afklares før der bygges

1. **Hvad er den sikre form?** En eksplicit `PATCH` med `{ "unset": ["ctaNote"] }`
   er tydelig og kan ikke ske ved et uheld. Et rent `PUT` der erstatter hele
   `.data` er enklere, men gør enhver ufuldstændig skrivning til et datatab — og
   det er netop den fejlklasse huset har levet med før.
2. **Bør `null` betyde slet?** Nemt at skrive, men umuligt at skelne fra «sæt
   feltet til ingenting», og et felt der bevidst er tomt er en gyldig tilstand.
3. **Hvilke felter må ALDRIG kunne fjernes?** `_fieldMeta`, `_seo`,
   `_lastEditedBy` og alt andet systemet selv ejer. Uden den spærre bliver det
   nye verbum den korteste vej til at ødelægge et dokument.
4. **Skal 405 på PUT blive stående?** Hvis svaret på spørgsmål 1 er «unset», så
   ja — men 405 bør da sige HVAD man skal gøre i stedet. En bar 405 er grunden
   til at jeg prøvede tre ting før jeg opgav.
5. **Dokumentationen skal rettes uanset udfaldet.** Påstanden om at PATCH
   erstatter `.data` helt er forkert i dag, og den står i det dokument hver
   session læser ved opstart.

## Reuse

Dette er cms' eget content-API. Ingen `@broberg/*`-pakke ejer skrivevejen, og
der er intet at genbruge udefra. Discovery-tjek kørt: ingen træf på en delt
dokument-mutations-primitiv.

## Rollout

Ikke-additiv af natur — et nyt verbum der kan FJERNE data. Det skal:

- seales med en prøve der beviser både at feltet forsvinder OG at
  nabofelterne overlever (den negative kontrol er den vigtige her),
- have en spærre på systemfelterne med sin egen prøve,
- afprøves mod et rigtigt dokument med læs-tilbage, ikke mod en 200.
