# Handlingsliste: databehandleraftaler

**Kun leverandører vi faktisk bruger i drift.** Målt 26/9-2026 på de 31 apps, der kører på Fly: hvilke adgangsnøgler der er sat (kun navnene, aldrig indholdet), plus de lagerforbindelser jeg har slået op én for én.

Af de 70 leverandører, der bliver nævnt i vores kode, er **32 i drift**. De øvrige 38 kræver ingen handling, fordi vi ikke sender dem noget.

Når du har gjort et punkt, så sig til. Så noterer jeg dato og hvem i `compliance/assessments.json`.

---

## 1. Du skal klikke eller underskrive (4)

| # | Leverandør | Hvorfor | Hvad du gør | Tid |
|---|---|---|---|---|
| 1 | **Fly.io** | Alle 31 apps kører her | Log ind på fly.io → **Documents** (fly.io/documents) → underskriv databehandleraftalen. Fly har allerede underskrevet; den gælder først, når du gør det. | 2 min |
| 2 | **Google Workspace** | Mail og login i Broberg ID, cardmem (læser din Gmail), Sanne, xrt81, Trail | admin.google.com (som superadmin) → Konto → Kontoindstillinger → **Juridisk og overholdelse** → *Cloud Data Processing Addendum* → Gennemse og acceptér. Google skriver, at det ikke skader at acceptere, hvis den allerede gælder. | 3 min |
| 3 | **GatewayAPI** | Sender SMS-koder fra Broberg ID til brugernes telefonnumre | Aftalen findes (onlinecity.io/legal-documents/gatewayapi/dpa-eu), men gælder først, når begge har underskrevet. Siden siger ikke hvordan. Se i GatewayAPI-kontrolpanelet eller skriv til deres support. **Jeg kan skrive mailen for dig.** | 5 min |
| 4 | **Opkald.ai** | Telefonsvarer for FD Sundhed. Helbredsnære data. | De skriver selv, at de har en databehandleraftale, men den er ikke offentlig. Den skal bestilles på hej@opkald.ai. **Jeg kan skrive mailen for dig.** | 5 min |

## 2. Indstilling der skal slås fra (1)

| Leverandør | Hvorfor | Hvad du gør |
|---|---|---|
| **Mistral** | Vores vigtigste AI (EU). Bruges i 10 apps, bl.a. FD Sundhed og Sanne. **Mistral træner som standard på det, vi sender dem.** | console.mistral.ai → Admin → **Privacy** → slå træning på vores data fra. Aftalen følger ellers automatisk med vilkårene. |

## 3. Lav prioritet: kun interne værktøjer eller ingen kundedata (3)

| Leverandør | Bruges til | Hvad der skal til |
|---|---|---|
| **Turso** | Discovery og buddy-cloud (vores egne værktøjer, ingen kundedata) | Aftalen gælder kun på betalte planer: log ind → Documents → underskriv. Kun nødvendig, hvis der kommer kundedata derind. |
| **Simply.com** | DNS for domæner | Kontrolpanel → databehandleraftale → underskriv. DNS indeholder ikke persondata, så det er mest for en god ordens skyld. |
| **Vimeo** | Videoer på Sannes site | Vores plan har ingen databehandleraftale (kun Enterprise). Til indlejrede videoer tilbyder Vimeo i stedet en aftale om, at vi hver især er selvstændigt ansvarlige, via en webformular (vimeo.axdraft.com). Tjek først, om Sannes videoer vises for besøgende uden login. |

## 4. Det skal du vide, men det er ikke en underskrift

- **Complimenta (FD Sundhed):** Complimenta er *klinikkens* databehandler, ikke vores. Når vi henter patientdata fra Complimenta, gør vi det for FD Aalborg. Derfor skal **vi have en databehandleraftale med FD Aalborg**. Findes den allerede?
- **Helbredsdata uden for EU:** FD Sundhed og Sannes site bruger amerikanske selskaber: Resend (mail), Cloudflare, Supabase, Firebase (push), OpenRouter, fal.ai, Stripe og Vimeo. For nogle af dem ligger selve data i EU (fx Supabase i Stockholm); det er selskabet, der er amerikansk. De har alle en gyldig aftale eller er certificeret, så det er lovligt. Men vi bør tjekke, **hvilke data der faktisk sendes**. Især skal Sannes brug af OpenRouter og fal.ai undersøges. Det er næste opgave, ikke en underskrift.
- **Resend** sender mails fra EU, men gemmer oplysninger om mailene (hvem, hvornår) i USA.

## 5. Allerede i orden: aftalen følger med vilkårene (link til den)

Tigris, Cloudflare, Resend, Stripe, Supabase, OpenAI, Anthropic, Google Gemini, OpenRouter, ElevenLabs, Microsoft Azure, GitHub, Firebase, Upstash og fal.ai. Ingen handling, bortset fra at de skal stå på listen over underleverandører på broberg.ai/trust senere.

**Ikke databehandlere for os:** Apple- og Microsoft-login, LinkedIn-login, browserens push-tjeneste, Discord (notifikationer til os selv) og TMDB (filmdata).

---

*Kilde: `compliance/compliance.yaml` og `compliance/scan-report.md` i cms-repoet, genereret af `scripts/compliance-scan.ts`. Leverandørernes vilkår blev læst 26/9-2026 på deres egne sider, og hvert link blev tjekket samme dag.*
