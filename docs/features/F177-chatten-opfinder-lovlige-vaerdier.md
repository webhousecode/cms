# F177 — Chatten opfinder lovlige værdier for et valgfelt, og intet stopper den

**Status:** Backlog
**Fundet:** 27. august 2026
**Oprindelse:** idé `01a043f6`, rejst mens jeg svarede components på deres chat-research

---

## Først: jeg tog fejl af hvad problemet var

Jeg rejste den her idé som et **omkostningsproblem** — "19 databaseopslag per chat-besked". Det tal lød alarmerende. Så målte jeg det.

```
RUN 1: 19 findMany-kald = 39ms   (kold)
RUN 2: 19 findMany-kald =  9ms
RUN 3: 19 findMany-kald =  6ms
```

Målt mod sanneandersens ægte indhold (197 dokumenter, 19 samlinger, lokal disk). **6–39 millisekunder.** En chat-tur tager sekunder. Opslagene er under en procent af den tid.

Jeg ledte med det tal, og det var forkert at gøre. Det er ikke et problem, og det skal ikke fikses som ét.

Men mens jeg målte, faldt jeg over noget der ER et problem, og det er værre end det jeg troede jeg havde fundet.

---

## Det egentlige fund: prompten er præcis om det den bærer, og opfinder frit det den udelader

Chattens systemprompt beskriver hvert eneste felt på sitet. For Sannes produkt-typer står der:

```
- `kind` (select) *required — Fulfillment-type
```

Den siger at feltet er et **valgfelt**. Den siger ikke **hvad man må vælge**.

De rigtige værdier i `cms.config.ts` er `digital`, `physical`, `gift`.

Jeg spurgte modellen, med kun prompten og ingen værktøjer:

**Spørgsmål 1 — "hvilke værdier er lovlige for `kind`?"**

> For feltet `kind` i 'product-types' er de lovlige værdier:
> * `digital` (Digital download/adgang)
> * `physical` (Fysisk produkt)
> * **`giftcard`** (Gavekort)

Den tredje findes ikke. Den rigtige hedder `gift`. Modellen opfandt et navn der ligner, og præsenterede alle tre med samme sikkerhed — ingen forbehold, ingen "jeg er ikke sikker".

**To ud af tre rigtige er værre end nul rigtige,** fordi svaret ser autoritativt ud. Ingen ville tjekke efter.

**Spørgsmål 2 — "opret en produkt-type, kind = digital download. Vis JSON'en først."**

```json
{ "slug": "kursus", "name": "Onlinekursus", "kind": "digital download" }
```

Den tog min formulering ordret. `"digital download"` er ikke engang i nærheden af en lovlig værdi.

### Sammenlign med kontrolprøven, for det er dér mønstret ligger

I samme runde spurgte jeg om en **samling der ikke findes**. Der nægtede modellen pænt at finde på noget, og listede de 19 rigtige i stedet.

Forskellen er ikke modellen. Forskellen er prompten:

| | Står i prompten? | Hvad gjorde modellen |
|---|---|---|
| Hvilke samlinger findes | **Ja** | Afviste korrekt en der ikke fandtes |
| Felter og typer på en samling | **Ja** | Gengav alle 7 felter korrekt, udpegede det påkrævede |
| **Lovlige værdier for et valgfelt** | **Nej** | **Fandt på — to gange, selvsikkert** |

Modellen finder ikke på når den ved hvad der findes. Den finder på præcis dér hvor vi har udeladt noget.

---

## Og der er intet net under det

Tre steder hvor det kunne være fanget, og ingen af dem gør det:

1. **Prompten beder selv om det den ikke leverer.** Regel 14 lyder: *"use exact option values for select fields"*. Prompten stiller kravet og udelader oplysningen der skal til for at opfylde det.
2. **`get_schema`-værktøjet HAR værdierne** — det returnerer `options: [...]` og `defaultValue`. Men intet tvinger modellen til at kalde det for et valgfelt. Regel 9 beder om et kald før man *opretter* et dokument; et *svar på et spørgsmål* er ikke omfattet, og prøve 1 ovenfor var netop det.
3. **Skrivevejen validerer ikke.** `packages/cms/src/schema/validate.ts` validerer *konfigurationen*, ikke *dataen*. Der er ingen kontrol nogen steder af at en gemt værdi er én af de deklarerede. `"giftcard"` ville blive skrevet til disken.

Så fejlen er hverken synlig for brugeren eller for systemet. Den ligger i filen bagefter og ser rigtig ud.

---

## Det gør ondt: vi har allerede løsningen, ét skridt væk

`packages/cms-admin/src/lib/agent-runner.ts`, linje 56–58 — den kode der driver AI-**agenterne**:

```ts
if (f.type === "select" && f.options && f.options.length > 0) {
  const validValues = f.options.map((o) => `"${o.value}"`).join(" | ");
  hint = `<select: MUST be one of ${validValues}>`;
}
```

Agenterne får de lovlige værdier serveret. Chatten gør ikke. **Samme repo, samme problem, én flade løst.**

Det er sjette gang i dag jeg finder præcis det mønster — se idé `01a04346`. Reglen fandtes allerede; den nåede bare ikke hen til den flade der ikke udløste behovet for den. En regel der findes ét sted ser nøjagtig ud som en regel der virker.

---

## Hvad jeg mener vi skal gøre

**Én ting haster, to er oprydning, og én skal vi lade være med.**

### 1. Skriv de lovlige værdier ind i prompten (haster)

Én linje i `system-prompt.ts`, lånt fra `agent-runner.ts` — importér reglen, skriv den ikke af. Det lukker hullet dér hvor modellen faktisk gætter.

Prisen er små: Sanne har 7 valgfelter i alt.

### 2. Lad skrivevejen afvise en ulovlig værdi (haster næsten lige så meget)

Prompten er en høflighed, ikke en kontrol — nøjagtig samme argument som ved samtykke-spærren på Sannes booking. Så længe motoren tager imod `"giftcard"`, er vi kun ét dårligt gæt fra en fil med noget i der ikke findes. Hører hjemme samme sted som F174's kontrol af påkrævede felter, så der er ét sted der ejer "opfylder dokumentet sit eget skema".

### 3. Sæt et loft over prompten (oprydning, ikke hastende)

Skema-delen er 56% af prompten på Sanne og skalerer lineært med sitets størrelse. Der er ingen bremse. Målt:

| Site | Samlinger / felter | Faktiske input-tokens |
|---|---|---|
| tomt skelet | 0 / 0 | ~2.500 |
| example-blog | 9 / 39 | ~2.900 |
| **sanneandersen** | **19 / 143** | **6.619** |

Et site med tre gange Sannes skema ville ligge omkring 15.000 tokens — hver eneste besked, før samtalen overhovedet begynder. Ingen ville opdage det før regningen eller et sammenbrud. En prøve der fejler når prompten overstiger et loft gør størrelsen synlig, før den bliver et problem.

### 4. Rør IKKE de 19 opslag (min anbefaling: lad være)

6 millisekunder. At cache dem er arbejde, ny kompleksitet og en cache der kan blive forældet — for at spare noget der ikke kan måles på en chat-tur. Det ville være at optimere det jeg først råbte op om, i stedet for det jeg faktisk fandt.

Hvis dokumenttallet nogensinde bliver dyrt, er det på en adapter over netværk (GitHub), hvor 19 opslag bliver 19 netværkskald. Det er ikke målt, og skal ikke bygges på en formodning.

---

## Afgrænsning

**Med:** valgfelter (`select`) i chattens systemprompt, og en kontrol af den gemte værdi på skrivevejen.

**Ikke med:** de 19 opslag (se punkt 4) · `defaultValue`, som `get_schema` også har og prompten udelader — samme klasse, men et gæt på en default er ikke en ulovlig værdi · relations-felter, hvor de "lovlige værdier" er levende indhold og ikke kan skrives ind i en prompt.

## Risiko ved at gøre det

At skrive værdierne ind i prompten kan ikke bryde noget — det er tilføjet tekst. Kontrollen på skrivevejen kan derimod afvise indhold der bliver gemt i dag. Derfor skal den måles først: findes der eksisterende dokumenter med en ulovlig valgfelt-værdi? Hvis ja, er de fundet med det samme, og de skal rettes før kontrollen slås til — samme rækkefølge som F174 (tæl først, ryd op, håndhæv derefter).

---

## Stories

| # | Titel | Prioritet |
|---|---|---|
| F177.1 | Chattens prompt skal fortælle hvilke værdier et valgfelt tillader | high |
| F177.2 | Tæl først, ryd op, håndhæv så — en ulovlig valgfelt-værdi skal afvises på skrivevejen | high |
| F177.3 | Et loft over systemprompten, så et stort site ikke stille vokser ud af sin egen kontekst | low |
