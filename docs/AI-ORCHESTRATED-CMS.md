# @cms: AI-Orkesteret Content Management — Strategisk Analyse & Implementeringsplan

## Kontekst

Vi har et solidt CMS med Phase 1-3 stort set implementeret: schema, storage, build, CLI, AI-grundlag (ContentAgent, SeoAgent), admin UI med editor, media library, revisions, AI chat panel, AI bubble menu, AI Lock, auth, scheduled publishing m.m.

Nu skal vi tage det fundamentale skridt: **gøre AI til kernen af CMS'et** — ikke bare et hjælpeværktøj i editoren, men en autonom motor der driver 85% af content-produktionen. Inspiration fra Gemini's redesign-koncept (docs/redesign/) og vores egen CMS-ENGINE.md spec.

---

## DEL 1: ANALYSE AF REDESIGN-KONCEPTET

### 1.1 Hvad cms.jsx demoen viser

Demoen præsenterer syv views der tilsammen tegner en AI-orkestrator-arkitektur:

**Dashboard** — Overbliks-nerve-center med fire KPI-kort (Total Indlæg, AI Autonomi %, Dagens Output, Konvertering), en Kurerings-kø med 3 ventende items, og en Status Monitor der viser aktive agenter.

**AI Cockpit Center** — "Maskinrummet". Live Orchestration-panel med neural-net-visualisering, OPS-counter, tre status-kort (Current Focus, Queue Depth, AI Health). Højre kolonne: fire skydere (Kreativitet/Temperature, Prompt Dybde, SEO Vægtning, Output Hastighed), Model Engine selector (GPT-4.5 / Claude 3.5), og "Re-Sync Orchestrator"-knap.

**AI Agenter** — Liste-view med agent-kort (SEO Strategen, Copy-Wizard, Social Media Pilot) — hver med effektivitets-%, opgaveliste, og ikon. Plus "Ny Agent"-flow med: Agent Profil (navn, rolle/speciale), System Prompt (med auto-generer), Adfærd-skydere (kreativitet, faglig/underholdende, verbosity), Værktøjer (web search, intern DB, billed-API toggles), Autonomi-niveau (Kladde & Godkendelse vs. Fuld Autonomi), og Deploy Agent-knap.

**Indhold** — Content-tabel med kolonnerne Titel, Status (Publiceret/Kladde/Planlagt), Agent (hvem genererede det), Dato, Performance-score. Søg + filter.

**Performance** — Trafik & AI-Vækst bar chart, SEO Dominans cirkel-gauge (82%, "Dit indhold rangerer på side 1 for 42 primære keywords").

**Brugere** — Team & Orkestratorer med roller (Site Owner, Editor) og Inviter-knap.

**Indstillinger** — Branding & Sprog, API Nøgler & Sikkerhed.

### 1.2 Hvad plan-patch.md tilføjer konceptuelt

- **Orkestrator-paradigmet**: Brugeren er ikke en "editor" men en "orkestrator" der sætter mål og godkender output
- **Autonomi-niveauer per agent**: "Kladde & Godkendelse" (standard, alt til kø) vs. "Fuld Autonomi" (publicerer direkte)
- **Feedback Loop**: Når orkestratoren retter i kureret tekst, *lærer systemet af rettelserne*
- **Token-kapacitet**: AI Kapacitet-bar i sidebar (7.2k / 10k tokens tilbage) — budget-awareness

### 1.3 Hvad web.html og infographic.html tilføjer

- **Interaktiv parametersimulering**: Sliders med live output-profil (faktuel/kreativ balance-bar + beskrivende tekst)
- **Estimeret Output Kapacitet**: Beregnet antal artikler/uge baseret på parameterindstillinger
- **Agent Økosystem doughnut chart**: Visuel fordeling af opgaver
- **Paradigmeskift-visualisering**: Traditionelt CMS (85% mekanisk skrivning) vs. @cms (70% strategi + 20% review)

---

## DEL 2: GAP-ANALYSE — HVAD VI HAR vs. HVAD VI MANGLER

### Hvad vi HAR i dag

| Lag | Kapabilitet | Status |
|-----|------------|--------|
| **cms-ai package** | ContentAgent: generate, rewrite, translate | Fungerer, men simpel (ingen tools, ingen streaming, ingen orchestration) |
| **cms-ai package** | SeoAgent: optimize (meta, jsonLd) | Fungerer |
| **cms-ai package** | ProviderRegistry: Anthropic + OpenAI | Fungerer med auto-fallback |
| **cms-ai package** | Kost-estimering per kald | Fungerer |
| **Admin UI** | AI Panel (chat sidebar med streaming) | Fungerer |
| **Admin UI** | AI Bubble Menu (inline rewrite) | Fungerer |
| **Admin UI** | AI Lock toggle per felt | Fungerer |
| **Admin UI** | AI Settings (provider + API key management) | Fungerer |
| **CMS Core** | _fieldMeta med aiLock | Fungerer |
| **CMS Core** | Scheduled publishing (cron) | Fungerer |

### Hvad vi MANGLER for 85% autonomi

| Koncept | Beskrivelse | Kompleksitet |
|---------|------------|-------------|
| **Agent Orchestrator Engine** | Central motor der kører, koordinerer og scheduler agents | Stor |
| **Agent Definition System** | Bruger-konfigurerbare agenter med system prompt, tone, værktøjer, autonomi | Stor |
| **Curation Queue** | Dedikeret kø for AI-genereret content der venter godkendelse | Medium |
| **Content Pipeline** | Automatisk flow: Topic → Research → Draft → SEO → Review → Publish | Stor |
| **Multi-draft Comparison** | Generer 2-3 forslag fra forskellige modeller/parametre, vælg bedste | Medium |
| **Brand Voice System** | Persistent tone/style-profil der informerer alle agenter | Medium |
| **AI Cockpit Center UI** | Dashboard med globale parametre, OPS, health monitoring | Medium |
| **Performance/Analytics** | Trafik-tracking, konvertering, SEO ranking | Medium-Stor |
| **Token Budget & Cost Tracking** | Real-time forbrug, budget-grænser, kapacitets-bar | Lille-Medium |
| **MCP Server Integration** | Agenter kan bruge eksterne MCP tools (web search, databaser, etc.) | Medium |
| **Push Notifications** | Notificér redaktør om nyt content til review | Medium |
| **Content Speaker (TTS)** | Oplæsning af AI-genereret content for mobil-review | Lille-Medium |
| **Feedback Learning Loop** | Lær af redaktørens rettelser, tilpas agenter over tid | Stor |

---

## DEL 3: TEKNISK DYBDEANALYSE

### 3.1 Konvertering — Hvad betyder det og hvordan måles det?

**Demoens "4.2% Konvertering"** refererer til den andel af besøgende der udfører en defineret mål-handling. I CMS-kontekst:

**Teknisk implementering:**
1. **Mål-definition i CMS Settings**: Redaktøren definerer konverteringsmål per side/collection — f.eks. "kontaktformular udfyldt", "klik på CTA-knap", "newsletter signup", "tid på side > 2 min"
2. **Tracking snippet**: CMS genererer et lille JS-snippet (`@webhouse/cms-analytics`) der indlejres i den statiske site. Det sender events til en endpoint.
3. **Event endpoint**: `POST /api/cms/analytics/event` modtager pageview, click, form-submit events
4. **Storage**: Events gemmes i en tidsserie-tabel (SQLite er fint for single-site) med: timestamp, pageUrl, eventType, sessionId, contentId, collectionName
5. **Beregning**: Konvertering = (sessions med mål-event) / (total sessions) * 100
6. **Per-content attribution**: Fordi vi kender contentId, kan vi beregne konverteringsrate *per artikel* — dette er guld for AI-feedback: "Artikler genereret af Copy-Wizard med formal tone konverterer 2.3x bedre"

**Hvad dette kræver af os:**
- Et lille analytics-modul i `@webhouse/cms` eller som separat `@webhouse/cms-analytics`
- Privacy-first: Ingen cookies, ingen PII, session = fingerprint-free hash af dag + IP-prefix
- Dashboard-widget med trafik + konvertering over tid
- Per-agent og per-tone-profil performance-sammenligning

### 3.2 AI Cockpit Center — Hvordan fungerer det i praksis?

Demoen viser skydere for Temperature, Prompt Dybde, SEO Vægtning og Output Hastighed. Her er hvad de faktisk gør bag kulisserne:

**Kreativitet (Temperature):** Direkte mapping til LLM temperature-parameter (0.0-1.0). Lav = faktuelt, forudsigeligt. Høj = kreativt, overraskende. Default 0.7 er balanced.

**Prompt Dybde:** Styrer hvor meget kontekst agenten sender med. Lav = bare collection schema + minimal instruktion. Høj = fuld site-kontekst, eksisterende artikler (RAG-lignende), brand guidelines, konkurrent-analyse. Jo dybere, jo bedre resultat, jo flere tokens (dyrere + langsommere).

**SEO Vægtning:** Procentuel balance-parameter der påvirker agentens system prompt. 0% = ren kreativ frihed. 100% = hvert afsnit struktureret efter target keywords, headers optimeret til featured snippets, internal linking maksimeret. I praksis: vi injicerer et SEO-instruktions-afsnit i system prompt der skalerer med denne parameter.

**Output Hastighed:** Balancen mellem kvalitet og hastighed. Lav hastighed = brug stærkeste model (Claude Opus/GPT-4), flere iterationer, automatic self-review. Høj hastighed = brug hurtigste model (Claude Haiku/GPT-4o-mini), single-pass, ingen self-review. Mapper til model-selection + antal passes.

**Model Engine Selection:** Simpel — vælg primary model. Men den spændende feature er **multi-model targeting**: send samme task til 2-3 modeller, præsentér resultaterne side-by-side i Curation Queue, redaktøren vælger den bedste. Over tid lærer systemet hvilken model der performer bedst til hvilken type content.

**"Re-Sync Orchestrator":** Genberegner alle agenternes konfiguration baseret på ændrede globale parametre. Stopper kørende tasks, rekonfigurerer, genstarter.

**Praktisk arkitektur:**
```
_data/ai-command.json
{
  "temperature": 0.7,
  "promptDepth": "medium",       // "minimal" | "medium" | "deep"
  "seoWeight": 0.8,              // 0.0 - 1.0
  "speedQuality": "balanced",    // "fast" | "balanced" | "thorough"
  "primaryModel": "claude-sonnet-4-6",
  "multiModelEnabled": false,
  "compareModels": ["claude-sonnet-4-6", "gpt-4o"],
  "monthlyBudgetUsd": 50,
  "currentMonthSpentUsd": 12.40
}
```

### 3.3 Agent-system — Hvem er standard, hvem er kommerciel?

**Open source (inkluderet i @webhouse/cms-ai):**

| Agent | Rolle | Begrundelse for gratis |
|-------|-------|----------------------|
| **Content Writer** | Generér artikler, sider, produktbeskrivelser | Kerne-funktionalitet — uden denne er CMS'et ikke AI-drevet |
| **SEO Optimizer** | Meta tags, schema.org, keyword-optimering | Allerede implementeret, essentiel for enhver site |
| **Translator** | Oversæt content mellem sprog | Allerede i ContentAgent, naturlig del af multilingual CMS |
| **Content Refresher** | Opdatér eksisterende content (fakta-tjek datoer, opdater statistikker) | Vigtig for content-vedligeholdelse — den autonome motor |

**Kommercielle plugins (fremtidige):**

| Agent | Rolle | Begrundelse for betalt |
|-------|-------|----------------------|
| **Social Media Pilot** | Auto-distribuer til LinkedIn, X, IG | Kræver platform-integrationer, API-nøgler, scheduling |
| **Brand Voice Trainer** | Lær tone fra eksempler, enforcer consistency | Avanceret ML, kræver fine-tuning eller embeddings |
| **Content Calendar AI** | Foreslå emner baseret på trends, gaps, sæson | Kræver external data sources (Google Trends, Ahrefs API) |
| **A/B Test Agent** | Generér varianter, track performance, auto-vælg vinder | Enterprise-feature |
| **Image/Media Agent** | Generer og optimér billeder (DALL-E, Flux, Midjourney) | Dyre API-kald, kræver image-pipeline |
| **Newsletter Agent** | Generér og distribuer email-nyhedsbreve | Kræver email-provider integration |
| **Analytics Reporter** | Ugentlig AI-rapport om site performance | Kræver analytics-integration |

**Custom agents (bruger-oprettede):**
Den vigtigste feature — brugeren kan oprette sine egne agenter med custom system prompts, tools og autonomi. Disse lever i `_data/agents/` som JSON-filer og kører via den samme orchestrator-motor.

### 3.4 Agent-oprettelse — Teknisk flow

Demoen viser et "Opret Ny Agent"-flow. Her er den tekniske realitet:

```
_data/agents/tech-writer-bot.json
{
  "id": "tech-writer-bot",
  "name": "Tech Writer Bot",
  "role": "copywriter",
  "systemPrompt": "Du er en erfaren tech-journalist der skriver...",
  "autoGeneratePrompt": false,
  "behavior": {
    "temperature": 0.7,
    "creativity": 70,            // slider 0-100
    "formality": 35,             // 0=casual, 100=academic
    "verbosity": 60              // 0=kort, 100=detaljeret
  },
  "tools": {
    "webSearch": true,
    "internalDatabase": true,
    "imageGenerator": false,
    "mcpServers": ["brave-search", "memory"]
  },
  "autonomy": "draft",           // "draft" | "full"
  "targetCollections": ["posts", "pages"],
  "schedule": {
    "enabled": true,
    "frequency": "daily",
    "time": "06:00",
    "maxPerRun": 3
  },
  "stats": {
    "totalGenerated": 142,
    "approved": 128,
    "rejected": 8,
    "edited": 6,
    "avgApprovalRate": 0.94
  }
}
```

**"Auto-generer" system prompt:** Når brugeren klikker "Auto-generer" i agent-formularen, sender vi agentens rolle + brand guidelines + eksempler på eksisterende content til en meta-agent der skriver det optimale system prompt. Genialt fordi det sænker barrieren enormt.

**Autonomi-niveauer forklaret:**
- **Kladde & Godkendelse (draft):** Alt output → Curation Queue med status "Ready". Redaktøren godkender, redigerer eller afviser. Standard for alle nye agenter.
- **Fuld Autonomi (full):** Agenten publicerer direkte. Kun for "trusted" agenter med høj historisk approval rate (>95%). CMS'et bør kræve at agenten har minimum 20 godkendte items før fuld autonomi kan aktiveres.

### 3.5 MCP Server Integration — Agenter med adgang til omverdenen

Dette er en af de mest banebrydende features. I dag bruger vores agenter kun LLM text-generation. Med MCP-integration kan de:

**Eksempler på MCP servers agenter kan tilkoble:**
- `brave-search` — Websøgning for research og fakta-tjek
- `memory` — Persistent agent-hukommelse mellem runs
- `github` — Hent issues/PRs til tech-blogging
- `google-analytics` — Hent performance-data for content-optimering
- `ahrefs/semrush` — SEO-data, keyword research
- `slack` — Notificér team om nyt content
- Custom MCP servers — enhver datakilde brugeren har

**Teknisk integration:**
Vores orchestrator instantierer en MCP client per agent-konfigureret server. Agentens LLM-kald bruger Anthropic's tool-use feature, hvor MCP tools registreres som available tools. Agenten kan så kalde `brave_search("seneste AI trends 2026")` midt i en content-generation og bruge resultatet i artiklen.

**Arkitektur:**
```
packages/cms-ai/src/mcp/
  client.ts          — MCP client wrapper
  tool-registry.ts   — Samler tools fra alle tilkoblede MCP servers
  agent-tools.ts     — Mapper MCP tools til Anthropic tool_use format
```

`cms-admin` Settings → AI → MCP Servers: Liste af tilkoblede servers med status (connected/error), tool-count, og add/remove.

### 3.6 Curation Queue — Det autonome CMS's nerve-center

Kurerings-køen er den vigtigste nye UI-komponent. Her lander alt AI-genereret content:

**Teknisk model:**
```typescript
interface QueueItem {
  id: string;
  agentId: string;
  agentName: string;
  collection: string;
  slug: string;
  title: string;
  status: "ready" | "in_review" | "approved" | "rejected" | "published";
  generatedAt: string;       // ISO timestamp
  contentData: Record<string, unknown>;  // det fulde dokument
  alternatives?: {           // multi-model forslag
    model: string;
    contentData: Record<string, unknown>;
    score?: number;
  }[];
  seoScore?: number;
  readabilityScore?: number;
  estimatedReadTime?: number;
  costUsd: number;
}
```

**Storage:** `_data/curation-queue.json` eller en dedikeret SQLite-tabel (bedre for queries/pagination).

**UI-flow:**
1. Dashboard viser "Kurerings-kø: 3 venter" badge
2. Klik → fuld liste med filter (Ready, In Review, Approved, Rejected)
3. Klik item → preview med alle felter, AI-confidence score, SEO-score
4. Handlinger: **Godkend & Publicer** (one-click), **Rediger først** (åbner i editor), **Afvis** (med feedback til agent), **Oplæs** (TTS)
5. Hvis multi-model: vis 2-3 versioner side-by-side, vælg bedste

**Content Speaker (TTS) — mobil curation:**
- Browser: Web Speech API (`speechSynthesis`) — gratis, ingen API-kald
- Avanceret: OpenAI TTS API eller ElevenLabs for naturlig stemme
- Mobil vision: PWA med push notifications → "Ny artikel klar til review" → åbn → oplæsning → godkend/afvis med stemme eller swipe

### 3.7 Performance & Analytics — Hvad driver konvertering?

**Data vi kan tracke uden tredjepartsintegrationer:**
1. **Content volume**: Artikler publiceret per dag/uge/måned, fordelt på agent
2. **Autonomi-rate**: % af content publiceret uden menneskelig redigering
3. **Approval rate per agent**: Hvor ofte godkendes agentens output direkte
4. **Cost per content piece**: Token-forbrug i USD per genereret artikel
5. **Time to publish**: Fra generation til publicering (effektivitets-mål)
6. **Edit distance**: Hvor meget ændrer redaktøren i AI-genereret content (levenshtein distance %)

**Data der kræver analytics-snippet på frontend-site:**
7. **Pageviews per artikel**
8. **Bounce rate**
9. **Time on page**
10. **Konvertering** (defineret per mål-type)
11. **SEO ranking** (kræver Search Console API integration)

**Dashboard-widgets inspireret af demoen:**
- Trafik & AI-Vækst: bar chart med pageviews over tid, overlejret med "AI-genereret" vs "manuelt"
- SEO Dominans: gauge chart med % af target keywords på side 1
- Agent Leaderboard: rangering af agenter efter approval rate og konvertering
- Cost Efficiency: USD per 1000 pageviews, fordelt på agent

### 3.8 Feedback Learning Loop — Det adaptive CMS

Når redaktøren redigerer AI-genereret content i kurerings-køen:

1. **Diff-capture**: System beregner diff mellem AI-output og redaktørens version
2. **Pattern-extraction**: Kategorisér rettelserne — tone-ændring? fakta-korrektion? strukturel omskrivning? forkortelse?
3. **Agent feedback storage**: Gem feedback-patterns per agent i `_data/agents/{id}/feedback.json`
4. **Prompt evolution**: Ved næste generation, injicér de seneste 5-10 feedback-patterns som "learn from corrections" i system prompt
5. **Over tid**: Agentens system prompt er dynamisk — grundpromptet + akkumuleret læring

**Simpel v1:** Gem bare (original, redigeret) par og inkludér de seneste 3 som few-shot examples i prompten.
**Avanceret v2:** Embeddings af rettelser, cluster-analyse for at finde systematiske mønstre.

---

## DEL 4: SIDEBAR & NAVIGATION REDESIGN

Vores nuværende sidebar:
```
Dashboard
Search
Media
Link Checker
Trash
--- Collections ---
posts
pages
services
...
Settings (i header dropdown)
```

Foreslået ny struktur (inspireret af demoen, men tilpasset vores virkelighed):

```
Dashboard (med KPI'er + Curation Queue mini-view)
---
AI Cockpit (globale parametre, health, OPS)
AI Agenter (liste, opret, konfigurér)
---
Indhold ▾ (expandable)
  posts
  pages
  services
  clients
  ...
Media
---
Performance (analytics + agent leaderboard)
---
Trash
Settings (i bunden, ikke i dropdown)
```

**Bemærk:** Collections pakkes under "Indhold" som en collapsible sektion — præcis som du foreslog. Giver plads til AI-sektionerne øverst og holder fokus på det vigtigste: orkestrering.

---

## DEL 5: OPEN SOURCE vs. COMMERCIAL STRATEGI

**Alt der gør CMS'et unikt og brugtbart = open source:**
- Agent orchestrator engine med scheduling
- Curation Queue (UI + backend)
- AI Cockpit Center (parametre, model selection)
- Standard agenter (Content Writer, SEO, Translator, Refresher)
- Agent definition system (custom agents med system prompts)
- AI Lock system
- MCP integration framework
- Basic analytics (content metrics, agent performance)
- Token budget tracking
- Content Speaker (browser TTS)

**Commercial plugins/premium tier:**
- Avancerede MCP servers (Ahrefs, SEMrush, Google Analytics)
- Brand Voice Trainer (ML-baseret tone learning)
- Multi-model A/B testing med automatisk vinder-selektion
- Social Media distribution agents
- Enterprise SSO og team management
- SLA på support og hosting
- Avanceret TTS (ElevenLabs/OpenAI stemmer)
- White-label (fjern @cms branding)

---

## DEL 6: IMPLEMENTERINGSPLAN — FASEOPDELT

### Phase A+B: Orchestrator Foundation + UI ✅ DONE (2026-03-13)

Køres som **to parallelle workstreams** (Agent Teams):

#### Workstream 1: Backend (cms-ai orchestrator)

**Mål:** Grundmotor der kan køre agenter autonomt.

**Session A1:** Agent Definition + Orchestrator Engine
- [x] **Agent Definition Model** — JSON-baseret agent-konfiguration i `_data/agents/`
  - [x] Standard `AgentConfig` interface med: id, name, role, systemPrompt, behavior (sliders), tools, autonomy, schedule, stats
  - [x] CRUD operationer: create, read, update, delete agent configs
  - [x] 4 default agenter pre-installed: Content Writer, SEO Optimizer, Translator, Content Refresher
- [x] **Orchestrator Engine** — `packages/cms-ai/src/orchestrator/`
  - [x] `engine.ts` — tager agent config + global command params → kører agent → returnerer result
  - [x] `scheduler.ts` — timer-baseret, checker schedule per agent
  - [x] `runner.ts` — bygger system prompt med global params + brand voice + feedback examples, kalder provider

**Session A2:** Curation Queue + Budget
- [x] **Curation Queue Backend** — `packages/cms-ai/src/orchestrator/queue.ts`
  - [x] CRUD for QueueItem (ready, in_review, approved, rejected, published)
  - [x] Approve → creates real CMS document via `cms.content.create()`
  - [x] Reject → stores feedback for agent learning
  - [x] Multi-draft support: `alternatives[]` array
- [x] **Token Budget Tracking** — `packages/cms-ai/src/budget/tracker.ts`
  - [x] Akkumulér cost per kald i `_data/ai-budget.json`
  - [x] Månedligt budget med alerts (warn at 80%, stop at 100%)
  - [x] Per-agent cost breakdown

#### Workstream 2: Admin UI

**Mål:** Sidebar redesign + nye views for agent management og curation.

- [x] **Sidebar navigation redesign** — Collapsible "Indhold", AI Cockpit, AI Agenter, Curation Queue, badge-counter, AI Kapacitet bar
- [x] **AI Agenter view** (`/admin/agents`) — Liste med agent-kort, effektivitet %, status
- [x] **Opret Ny Agent flow** (`/admin/agents/new`) — Profil, system prompt, adfærd-skydere, autonomi, deploy
- [x] **Curation Queue view** (`/admin/curation`) — Filter, preview, Godkend/Rediger/Afvis, TTS-knap
- [x] **AI Cockpit Center** (`/admin/command`) — Globale parameter-skydere, model selector, budget, status monitor

---

### Phase C: MCP + Tool-Use + Multi-Model + Scheduling ✅ DONE (2026-03-14)

**Mål:** Agenter kan bruge eksterne tools. CMS eksponeret som MCP server. Fuld autonom scheduling.

- [x] **Admin MCP Server** (`/api/mcp/admin`) — SSE transport, Bearer auth, 15 tools
- [x] **Public MCP Server** (`/api/mcp`) — Read-only, rate-limited
- [x] **MCP Settings UI** (`/admin/settings?tab=mcp`) — Endpoints, API key management med scopes
- [x] **Project-level MCP config** (`.mcp.json`) — Claude Code integration fungerer
- [x] **Tool-use i agent execution** — Anthropic tool_use loop i runner.ts (max 10 iterationer, kumulativ cost tracking)
- [x] **Built-in CMS tools** — `cms_search`, `cms_get_document`, `cms_list_collection`, `cms_list_collections` (agents kan søge/læse eksisterende content)
- [x] **Web search tool** — Brave Search API integration (`BRAVE_API_KEY` env)
- [x] **Tool registry** — `src/lib/tools/` med pluggable tool system (CMS tools + web search + fremtidige MCP tools)
- [x] **Multi-draft generation** — Når `multiModelEnabled=true` i cockpit, sender til alle `compareModels` parallelt, gemmer som `alternatives[]` i queue
- [x] **Pick alternative** — API endpoint + UI for at vælge bedste version fra multi-model output
- [x] **Autonom scheduling end-to-end** — `src/lib/scheduler.ts` med deduplication (state file), budget gate, smart prompt generation, per-agent last-run tracking
- [x] **Budget tracking** — `addCost()` i cockpit, månedlig auto-reset, alle LLM-kald tracked
- [x] **Content Context (RAG-lite)** — Alle AI-prompter injiceres med kompakt oversigt over alt published content (titler, URLs, excerpts, tags)

### Phase D: Analytics + Feedback Loop (1-2 sessions)

**Mål:** Mål performance og lær af redaktørens rettelser.

1. **Analytics snippet** — Letvægts tracking script til frontend-site
2. **Analytics API + dashboard** — Trafik, konvertering, per-agent stats
3. **Feedback capture** — Diff-beregning ved curation-edit
4. **Prompt evolution** — Inject feedback i agent system prompts

### Phase E: Content Speaker + Mobile (1 session)

**Mål:** Redaktøren kan kurere content on-the-go.

1. **Browser TTS** — Web Speech API oplæsning i Curation Queue
2. **PWA optimering** — Push notifications for nye queue items
3. **Mobile-optimeret curation UI** — Swipe godkend/afvis

### Phase F: Dashboard KPI'er + AI Cockpit polish (1 session)

**Mål:** Det smukke overblik fra demoen.

1. **Dashboard redesign** — KPI-kort, curation-kø mini-view, agent status monitor
2. **AI Cockpit Center** — Interaktive skydere, live output-profil, OPS-counter
3. **Performance view** — Charts, SEO gauge, agent leaderboard

---

## DEL 7: BESLUTNINGER TAGET

| Spørgsmål | Beslutning |
|-----------|-----------|
| **Scheduling** | **Hybrid** — Start med Next.js cron (instrumentation.ts), arkitektér bag interface så den kan flyttes til worker senere |
| **Feedback learning** | **Few-shot examples** — Gem (original, rettet) par, inkludér seneste 3-5 som eksempler i agent-prompt. Ingen ML i v1 |
| **Analytics** | **Privacy-first + GA4 option** — Eget letvægts-script som default (ingen cookies), GA4 som valgfri tilkobling |
| **Implementeringsstart** | **A+B parallel (Agent Teams)** — Backend-team bygger orchestrator, UI-team bygger views samtidigt |
| **Sidebar navigation** | Godkendt — se endelig struktur nedenfor |
| **Curation Queue** | **Egen sidebar-item med badge** — Top-level med `[3]` counter, altid synlig |

### Endelig sidebar-struktur

```
Dashboard                    ← KPI-kort, mini agent-status
AI Cockpit                   ← Content Orchestrator & Curator (COCpit)
AI Agenter                   ← Liste + opret agent
Curation Queue  [3]          ← Ventende AI-content, badge-counter
────────────────
Indhold ▾                    ← Collapsible
  posts
  pages
  services
  clients
  team
  timeline
Media
────────────────
Performance                  ← Analytics, agent leaderboard, SEO
────────────────
[AI Kapacitet bar]           ← Token budget visual
Trash
Settings
```
