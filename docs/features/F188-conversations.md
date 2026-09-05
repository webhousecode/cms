# F188 — Conversations: besøgendes AI-samtaler som eget CMS-modul

## Motivation

Ejerordre 5/9-2026: «Vi skal helt klart have lavet et Samtaler modul i CMS, det skal nu nok hedde Conversations eller bare Chat.»

**Målt før noget blev besluttet** (broberg-ai-site, `src/aidan*.ts`): chathistorikken gemmes **slet ikke**. Der findes ingen skrivning af samtaler nogen steder i koden. Det eneste der lander på disken er:

| Hvad | Hvor | Indhold |
|---|---|---|
| Leads | `/data/aidan-leads.jsonl` | Mail + hvad der blev bedt om, når den besøgende selv beder om det |
| Tommelfingre | `/data/aidan-feedback.jsonl` | 👍/👎 + uddrag ≤160 tegn + sprog + tidspunkt |

Samtalen lever i browserens hukommelse under besøget og er væk bagefter. Ejeren kan altså ikke se hvad folk spørger Aidan om — kun hvad de gav tommel op/ned til.

## Hvorfor ikke bare i Forms (F187)

Første — for løse — svar var «chatten som modul i Form Engine 2.0». Det holder kun for den ene halvdel:

- **Kundeemner HØRER i Forms.** Når Aidan opsamler en mailadresse («send dette svar til mig», transskript-tilbuddet) er det reelt en indsendelse — indsamlet gennem en samtale i stedet for et skema. Den skal i **samme indbakke** som kontaktformularen, mærket med kilden. Ellers er der to steder at holde øje med kundeemner, og det ene bliver glemt.
- **Samtalen HØRER IKKE.** En indsendelse er et sæt felter med værdier; en samtale er ture med roller, tidsstempler og markører. Presses den ned i felt/værdi-modellen bliver den til `besked_1, besked_2, …` — og så kan Forms' egne værktøjer (tragt, gruppering, statistik pr. felt) ikke bruges alligevel. Det ville være at bøje datamodellen for at kunne sige at vi genbrugte den.

**Derfor: eget modul der låner Forms' RAMME** (indbakke-visning, filtre, statistik-komponenter, opbevaringsregler), men har sin egen tabel med ture.

## Navnet

**Conversations**, ikke Chat. `packages/cms-admin/src/components/chat/` er allerede ejerens egen AI-chat med CMS'et (F107, 40 værktøjer). To sidebar-punkter ved navn «Chat» ville betyde hver sin ting for den samme bruger.

## Arkitektur-skitse

- **Datamodel:** `conversations` (id, site, locale, startet, sidst-set, antal-ture, kilde) + `conversation_turns` (rolle, tekst, tidspunkt, markører). Pr. site, som alt andet.
- **Optagelse:** sitet POSTer samtalen til cms-admin ved afslutning (eller løbende pr. tur — afgøres i F188.1). Token-auth som øvrige site→admin-ruter, `?site=` håndteres af proxy (husets regel: site-kontekst opløses i proxy.ts, ikke i ruten).
- **Kobling til Forms:** endte samtalen i et kundeemne, peger samtalen på indsendelsen og indsendelsen tilbage på samtalen. Én linje hver vej — så man kan se hvad der blev sagt, før man svarer et menneske.
- **Statistik:** antal samtaler, ture pr. samtale, frafald, emner, og **ubesvarede spørgsmål** (miss-signalet, jf. F251 hos trail — samme hovedvending sendes til Trail som råstof til nye neuroner).
- **Rettigheder:** nyt permission-streng, gated på ALLE lag (sidebar, server-side page, API-rute, chat-tool) jf. husets hard rule. Spørgsmålet «admin-only eller også editors?» besvares i F188.1.

## Persondata — den ene beslutning der er ejerens

En chatlog er andres ord om deres egne forretninger: folk skriver firmanavne og hvad de kæmper med. **Anbefaling: 90 dage på selve teksten; tallene (antal, emner, misses) beholdes uden tidsgrænse.** Så bevares indsigten uden at der samles et arkiv af fremmedes samtaler. Ejerens beslutning — står åben til den er truffet, og bør afgøres før fritekst-lageret bygges (samme rækkefølge som trail selv valgte i F251).

## Non-goals

- Live-medlæsning / overtagelse af en kørende samtale (senere, hvis nogen efterlyser det).
- Chatten på tværs af sites i én samlet visning — modulet er per-site som resten af CMS'et.
- Ændringer i F187 Form Engine 2.0 ud over den ene kobling begge veje.

## Reuse

Discovery-tjek: intet `@broberg/*`-pakke ejer «gem en AI-samtale». Modulet genbruger CMS'ets egne primitiver (site-pool, permissions-shared, proxy-site-kontekst, Forms' indbakke-komponenter). Miss-signalet genbruger trails F251-kontrakt frem for at bygge en parallel tæller.
