# F185 — trailmem.com bliver et ægte CMS-site

> **Status: BLOKERET af F184.** Se «Afhængigheden» nedenfor — den er ikke en formalitet, den er grunden til at intet af dette kan bygges endnu.

## Hvad Christian bad om

Ordret, 2. september 2026:

> «Du skal desuden gå igang med at transformere sitet til et ÆGTE cms site så ALT content er i cms under org:broberg.ai og at der er inline-editing på alt. Det skal være 1:1 og den skal køre ICD som broberg.ai og sanne gør.»

Fire krav i én sætning: **alt indhold i CMS** · **inline-redigering på alt** · **1:1** · **ICD som de andre sites**. Det sidste er F184 og er ikke en del af dette kort; de tre første er.

## Målt, ikke vurderet

Kørt med repoets egen `cms check-editable --sitemap` (F162.7), og med et rask site som **positiv kontrol** — for et værktøj der melder 700 huller skal først bevise at det også kan melde nul:

```
                sider   inline-redigerbare felter   huller
trailmem.com       62                           0      700
broberg.ai        103                        9.930        0   ← kontrol
```

**0 redigerbare felter** er det bærende tal. Det er ikke «lav dækning» — der findes ikke ét `data-cms-field` på hele sitet. Inline-redigering er ikke delvist til stede; den er slet ikke der.

**700 huller betyder IKKE 700 tekster der mangler i CMS'et.** Det tal blev krydstjekket
frem for forklaret — hvert af de 700 hullers tekst slået op i alt indhold på site=trail:

```
700  huller i alt (680 unikke tekster; resten er samme tekst på flere sider)
618    · teksten STÅR allerede i CMS'et — mangler kun data-cms-field      88,3 %
 82    · teksten findes IKKE i CMS'et (75 unikke)                          11,7 %
```

Det deler arbejdet i to, og de to halvdele er ikke lige store:

- **618 er opmærkningsarbejde.** Teksten er allerede redigerbar i CMS-admin; den kan bare ikke
  klikkes på ude på siden. Det er én ændring i `build.ts`, ikke 618 beslutninger.
- **82 er indholdsarbejde.** Heraf de 30 billedtekster nedenfor, en del tekst der er BAGT IND I
  SVG-figurerne selv («TRANSLUCENT SCREEN KEYBOARD LEVERS MICROFILM STORAGE», «1945 MEMEX Bush
  … 1968 THE DEMO Engelbart»), og nogle få ægte skabelontekster («Contact», «Changes»,
  «No posts yet.»). SVG-teksten er en kategori for sig og skal afgøres særskilt: den er synlig
  prosa, men den er også en del af en tegning.

**Kontrollen kørte før tallene, i begge retninger:** en kendt CMS-tekst SKAL findes, en opdigtet
må ikke. Uden den kunne «82 ikke i CMS» lige så godt betyde at opslaget var i stykker.

**En tidligere måling i denne tråd nævnte 344 tekstblokke / 33 ægte prosa.** Den er
SUPERSEDERET af tallene ovenfor og bør ikke bruges: den scannede hele siden inkl. menu og
foden, talte unikke strenge frem for elementer, og målte altså en anden population end
`check-editable`. To tal fra to værktøjer med hver sit udsnit er den slags par der bliver lagt
sammen af en der læser hurtigt.

### De 30 billedtekster — det konkrete fund

```
apps/landing/public/uploads/svg/captions.json     30 billedtekster
```

Tredive synlige billedtekster ligger i en JSON-fil ved siden af CMS'et. Fx:

- *«A schematic reading of Bush's proposed desk: slanting translucent screens, keyboard, levers, and microfilm reels stored in the base.»*
- *«The nine-step path every source takes to become a Neuron. The amber branch is auto-approved; the dashed one waits on a human curator.»*

Det er rigtig, redaktionel prosa. En redaktør kan ikke søge den frem i CMS-admin, ikke se den i editoren, og ikke rette den uden et deploy. Det er husets regel — *tekst hører hjemme i CMS'et, aldrig kun i koden* — brudt tredive steder, og det er den mest håndgribelige del af «1:1».

## Afhængigheden, og hvorfor den ikke kan omgås

**Inline-redigering kræver at `build.ts` udsender `data-cms-field`-attributter. Netop den fil er den der ikke når frem.**

F184 målte det: vores kopi af trails `build.ts` er frosset 3. maj (63.139 bytes mod repoets 78.950), fire commits har rørt filen siden, nul er nået frem. trail-sessionen målte deres halvdel og fandt det værre: deres egen udrulnings-workflow har **fejlet fem gange på to uger** (`Error: app not found`) uden at nogen opdagede det, fordi vores frosne kopi blev ved med at holde sitet i luften.

Trails egen formulering er den skarpeste: **indhold flyder, kode gør ikke.** Den forklarer også et forvirrende symptom de så samme dag — af tre rettelser Christian bad om, blev én live og to ikke. Den ene var i praksis ikke en kodeændring: feltet `signInHref` kom ind FØR frysningen, så den frosne kopi læste allerede CMS-værdien.

Konsekvensen for dette kort: **enhver `data-cms-field`-attribut vi tilføjer i dag ville blive skrevet, committet, bygget lokalt, verificeret i `dist/`, passere CI — og aldrig nå frem.** Arbejdet ville se færdigt ud og være dødt. Derfor er F185 blokeret, ikke bare «afhængig af».

## Aftalt rækkefølge (fælles design med trail-sessionen, #25009–25011)

1. **trail retter sin egen workflow** og beviser den er grøn. *Deres halvdel.*
2. **trail beviser at en ændring i `build.ts` faktisk når frem** — prøven er «built by» → «built with», som allerede er committet og beviseligt ikke fremme. *Deres halvdel.*
3. **Først derefter fjerner vi vores frosne kopi.** *Vores halvdel.* Ingen naked cutover: vores kopi er lige nu det eneste der holder trailmem.com i luften.
4. **Så — og først så — dette kort.**

## Scope

### 1. De 30 billedtekster ind i CMS'et
En samling (eller et felt på den eksisterende figur-model) der bærer billedteksten, så den kan søges, ses og rettes. `captions.json` bliver en nødbremse, ikke et hjem. **Bevis:** hver af de 30 skal kunne søges frem i CMS-admin og findes.

### 2. `data-cms-field` på hvert redigerbart element
Fra 0 til det der giver `cms check-editable` nul huller. Attributterne udsendes af `build.ts` — trails fil, vores konvention.

### 3. De resterende ægte prosatekster
33 minus de 30 billedtekster = 3, plus de af de 282 etiketter der er redaktionelle frem for strukturelle. Hver enkelt afgøres: hører den i CMS, eller er den skabelon-mekanik?

### 4. Porten
`cms check-editable --sitemap` i trails CI, med 0 huller som krav. Uden den skrider dækningen igen, og ingen ser det.

## Non-goals

- **De 29 sammensatte tekster** («Research · April 20, 2026 · 14 min read»). De ER CMS-værdier sat sammen af en skabelon. At lægge den sammensatte streng i CMS ville skabe to sandheder om samme dato.
- **De 42 genererede tag-sider.** Afledt af posts' egne tags; ikke indhold der skrives.
- **Design- eller layoutændringer.** Dette kort flytter tekst og tilføjer attributter; det redesigner ikke.
- **F184 selv.** Beskrevet her fordi det blokerer, men bygges der.

## Hvor kortene ligger — og hvorfor to af dem flyttede

Efter aftale med trail-sessionen (#25014) er de to stories der er REN trail-kode flyttet til
trail-boardet. Deres begrundelse, og den er rigtig: en trail-session i queue-drain ser aldrig
et kort på cms-boardet, så arbejdet ville ligge og vente på at nogen tilfældigt huskede det.
Og Christian kigger på trail-boardet når han vil vide hvad der sker i trail.

**Flyttet, ikke spejlet.** Et spejl er to rækker der kan skride fra hinanden.

| Nu | Før | Ejer | Hvad |
|---|---|---|---|
| `trail-F223` | F185.1 | trail | de 30 billedtekster ind i CMS'et |
| `trail-F224` | F185.2 | trail | `data-cms-field` på hvert element |
| `cms-F185.3` | — | cms | de resterende tekster klassificeres |
| `cms-F185.4` | — | cms | porten i CI |

**To ting gik ikke som aftalt ved flytningen, og de står her frem for at blive opdaget senere:**

1. **Numrene ændrede sig.** `cardmem_move_card_to_project` tildeler modtager-projektets næste
   frie F-nummer; F185.1/.2 kunne ikke følge med. Det er værktøjets dokumenterede opførsel,
   ikke et uheld — men det betyder at en henvisning til «F185.2» andre steder nu er død.
2. **Plan-stien fulgte ikke med** (`plans_copied: 0`). Trail bad om at den blev pegende på
   dette dokument, så der stadig kun var ét sted at læse hvorfor. De to kort står nu uden
   plan-doc. Accepteret ændring skal træffes af trail: enten en kort plan-doc i deres repo der
   peger herhen, eller forældre dem under et trail-epic der har en.

## Ejerskab på tværs af repoer

`build.ts` og `captions.json` ligger i **trails repo** og ejes af trail-sessionen. CMS-indholdet, skemaet, `@broberg/cms-inline-edit` og `cms check-editable` er **vores**. Efter husets fælles-design-regel: vi bliver enige om mekanismen, og den der ejer en halvdel bygger den. Ingen parallelle lapper.

## Reuse

Discovery-tjek kørt mod det der skal bruges:

- **Måling af redigerbarhed** — ingen ny kode. `cms check-editable --sitemap` (F162.7) findes i `packages/cms-cli` og gav hele svaret ovenfor. Jeg håndrullede først et engangs-script til præcis dette, opdagede kommandoen bagefter, og kasserede scriptet. Det er noteret her frem for skjult, fordi det er nøjagtig den fejl reuse-reglen findes for.
- **Inline-redigering** — `@broberg/cms-inline-edit`, allerede i drift på broberg.ai og sanneandersen. Intet nyt.
- **Porten i CI** — F162.4's genbrugelige workflow, ikke en trail-specifik kopi.
- Ingen `@broberg/*`-pakke mangler til dette; intet nyt skal udgives.
