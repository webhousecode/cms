# Overlevering før kontekst-nulstilling — 18. september 2026, aften (dansk tid)

Du læser den her fordi din kontekst blev ryddet med `/clear`, og du sandsynligvis
vågnede UDEN den sædvanlige orientering fra buddy (deres SessionStart-hook lytter kun
efter «compact», ikke efter «clear» — det er selve dét forsøget måler). Antag at du
ikke ved noget. Alt hvad du skal bruge står her.

**Hvem er du:** cc-sessionen i repoet `@webhouse/cms` på `/Users/cb/Apps/webhouse/cms`.
Session-id `4b0d6a7e-e79c-493b-9153-f72659c43cf5`. Ejeren er Christian Broberg — han
programmerer ikke, så skriv til ham i produkt- og brugertermer, på dansk, kort.

---

## 1 · Hvad du arbejdede på — F-numre

**Ærligt svar: ingen kort i cms var i gang i denne session.** Boardet viser 62 «in
progress», men ingen af dem blev rørt her. Skriv det ikke om til noget der lyder
bedre — det ville sende den næste session ud at lede efter arbejde der ikke findes.

Det ENESTE aktive stykke arbejde var i et ANDET repo og har intet F-nummer endnu:

| hvad | hvor | tilstand |
|---|---|---|
| **LinkedIn-opslag, tone of voice** | `/Users/cb/Apps/broberg/broberg-ai-site` | 3 eksempler skrevet, **afventer Christians svar** |
| F198.1 (ukendt forespørgselsparameter → 400) | cms, Backlog | ikke påbegyndt, intet rørt |

F198.1 har en plan-doc (commit `c6502fb4`). Den er ikke taget op. Lad den ligge til
han beder om den.

---

## 2 · Sidste overlevering — hvor LinkedIn-arbejdet står

**Hele konteksten ligger i en fil du skal læse først:**
`/Users/cb/Apps/broberg/broberg-ai-site/docs/linkedin/TONE-OF-VOICE-UDKAST.md`
(commit `5e8572a` i dét repo). Den indeholder alt nedenstående i fuld længde.

**Opgaven:** Christian vil have et system der hver morgen sender ham ét færdigskrevet
LinkedIn-opslag om en artikel eller et flagskib fra broberg.ai, klar til at poste.
Der er ~38 mulige opslag (22 artikler + 16 flagskibe).

**Hans fire beslutninger, truffet i denne session — de er bindende:**

1. **Hold, ikke alle på én gang.** Først 3 eksempler til at efterprøve tonen, derefter
   hold à 5–8.
2. **Broberg ID-opslaget skrives i datid («har lanceret»), men kommer SIDST** i
   rotationen. De FØRSTE artikler og flagskibene bruges som tone-of-voice-grundlag.
3. **JA til tre tilstande** pr. opslag i filen: `planlagt` / `sendt` / `sprunget over`.
   Ikke to. Med kun «sendt ja/nej» ville et opslag han bevidst sprang over dukke op
   igen ugen efter.
4. **Mailen sendes kl. 09.00 dansk tid**, og i mailen står et anbefalet
   opslagstidspunkt der matcher LinkedIns egne anbefalinger.

**Hvad der ER gjort:** de tre eksempler er skrevet (Bevis ikke løfter · Fra forfatter
til redaktør · Lens) og lagt i filen ovenfor. Grundlaget er MÅLT, ikke husket —
artiklernes datoer er hentet fra broberg.ai/nyheder, flagskibslisten fra llms.txt.

**Hvad der MANGLER:** hans svar. Intet må bygges før han har godkendt tonen.

**Ét ubesvaret spørgsmål jeg stillede ham:** LinkedIn nedprioriterer opslag med et
eksternt link i brødteksten, så linket hører formentlig til i første kommentar. Det
ændrer systemets form — to felter pr. opslag i stedet for ét — og er derfor hans valg.

---

## 3 · Git-tilstand

| repo | branch | rent? | seneste commit |
|---|---|---|---|
| `/Users/cb/Apps/webhouse/cms` | `main` | ja | `08f92086` chore(cardmem): scaffolded onboarding config |
| `/Users/cb/Apps/broberg/broberg-ai-site` | `main` | ja | `5e8572a` docs(linkedin): tone-of-voice-udkast |

Begge træer var rene før denne fil blev skrevet. Intet er stashet, intet halvfærdigt.
`5e8572a` er **ikke pushet** — den ligger lokalt, med vilje: en docs-fil skal ikke
udløse et produktions-deploy af broberg.ai.

---

## 4 · Næste skridt — én sætning

**Spørg Christian om han godkender tonen i de tre eksempler i
`broberg-ai-site/docs/linkedin/TONE-OF-VOICE-UDKAST.md`, og om linket skal ligge i
første kommentar eller i brødteksten — og byg først hold 1 når han har svaret.**
