# F187 — Form Engine 2.0: totalt remake

## Motivation
Ejeren, 5/9-2026: «Form Engine er elendig, så den skal have et totalt REMAKE så den er up-to-date med hvad moderne tragte og form tools har med sig — lav en mockup.» Samtidig besluttet (samme dag): Aidan-tragten (leads fra lydfil/svar/transskript + 👍/👎-feedback fra broberg.ai) «skal ind i CMS som et modul så vi kan lave noget statistik».

## Scope (mockup-fasen — bygges EFTER ejer-approve af mockup)
Én samlet flade der matcher moderne form/tragt-værktøjer (Typeform/Tally/HubSpot-klassen), på husets eget design:

1. **Builder**: felt-palette (træk/klik), multi-step med fremdrift, betinget logik (vis felt hvis …), skjult felt/UTM-fangst, spam-værn (Turnstile — @broberg/forms-turnstile findes), tak-side/redirect.
2. **Tragte**: en indsendelse er et LEAD med stadie (Ny → Kontaktet → Møde → Vundet/Tabt) — kanban + liste; kilde-attribution (side, kampagne, Aidan-chat).
3. **Indbakke 2.0**: samlet på tværs af forme + eksterne strømme; svar/notér; eksport (CSV); GDPR-sletning pr. lead.
4. **Statistik** (ejerens eksplicitte krav): visninger → starter → gennemførte (konvertering pr. form + pr. step, drop-off), leads over tid, kilder, OG Aidan-strømmene: 👍/👎-rate pr. dag, mail-leads pr. type (lydfil/svar/transskript).
5. **Aidan-modulet**: broberg.ai's endpoints leverer ind i modulet (erstatter JSONL; JSONL+bcc som backup til bevist) — broberg-ai-site-F007.15 er modpart-kortet.

## Reuse
Eksisterende F30-formdata migreres (ingen nøgen omlægning); @broberg/forms-turnstile; mail via @broberg/mail; permissions pr. hard rule (forms.*-permissions, ingen rå rolletjek). AI: forslag til form ud fra formål via @broberg/ai-sdk (cheap, EU) — moderne tools har det, vi har chokepointet.

## Rollout
1. Mockup (denne fase) → ejer-approve i Mockups-fladen.
2. Stories med AC pr. blok (builder/tragt/indbakke/statistik/Aidan-indtag) — ingen kode før da.
3. Migrering fra F30 med genlæsnings-bevis; gammel flade fjernes først når 2.0 er bevist (no naked cutover).
