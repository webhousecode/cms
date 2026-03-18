# SECURITY-GATE-PLAN.md

> WebHouse Security Gate — Plan for systematisk sikkerhedsscanning på tværs af alle projekter.
> Kontekst: Vibe coding-krisen er reel. Vi bruger AI-assisteret udvikling intensivt (Claude Code),
> og selvom vi arbejder med PLAN.md-dokumenter og forstår arkitekturen, har vi brug for automatiserede
> sikkerhedsnet der fanger det vi overser. Denne plan beskriver tre faser der tilsammen giver et
> lagdelt forsvar mod de mest almindelige sårbarheder i AI-genereret kode.

---

## Baggrund og motivation

Dokumenterede mønstre i AI-genereret kode der fører til breaches:

- Hardcoded API keys og secrets i klientkode
- Åbne databaser (Firebase uden auth, Supabase uden Row Level Security)
- Manglende authentication/authorization på API-routes
- Default-konfigurationer der aldrig bliver strammet
- Dependency vulnerabilities der aldrig bliver opdateret
- Copy-paste kode uden forståelse for sikkerhedsimplikationer

Vores mål: Fang disse problemer automatisk, før de når production.

---

## Fase 1 — Lokal toolchain (manuelt setup)

**Formål:** Installer og konfigurer open source sikkerhedsværktøjer lokalt på Mac M1.
Denne fase er 100 % manuelle trin. Ingen cc nødvendig.

### 1.1 Installer Semgrep (SAST — Static Application Security Testing)

```bash
brew install semgrep
```

Verifikation:

```bash
semgrep --version
```

Test mod et eksisterende projekt:

```bash
cd ~/projekter/whop          # eller et andet repo
semgrep --config auto --severity ERROR .
```

`--config auto` henter Semgreps community-regler for det sprog der detekteres.
For mere målrettet scanning mod vores stack:

```bash
semgrep --config p/nextjs --config p/typescript --config p/javascript .
```

Vigtige Semgrep rule packs til vores stack:

- `p/nextjs` — Next.js-specifikke regler
- `p/typescript` — TypeScript-regler
- `p/javascript` — generelle JS-regler
- `p/owasp-top-ten` — OWASP Top 10 sårbarheder
- `p/secrets` — hardcoded secrets detection
- `p/docker` — Dockerfile-misconfigurations (relevant for WHop migration)

### 1.2 Installer Gitleaks (secrets scanning)

```bash
brew install gitleaks
```

Test mod et repo:

```bash
cd ~/projekter/whop
gitleaks detect --source . --verbose
```

Scan hele git-historikken (vigtigt for gamle commits med secrets):

```bash
gitleaks detect --source . --verbose --log-opts="--all"
```

### 1.3 Installer Trivy (dependency + Docker scanning)

```bash
brew install trivy
```

Scan et Node.js-projekt for sårbare dependencies:

```bash
cd ~/projekter/whop
trivy fs --scanners vuln .
```

Scan en Dockerfile:

```bash
trivy config Dockerfile
```

### 1.4 Installer OWASP ZAP (dynamisk scanning — optional)

ZAP er tungere og bruges til at scanne kørende applikationer.
Installer kun hvis du vil lave aktiv penetration testing mod staging-miljøer.

```bash
brew install --cask zap
```

### 1.5 ESLint security plugins

I hvert projekt der bruger ESLint:

```bash
pnpm add -D eslint-plugin-security eslint-plugin-no-secrets
```

Tilføj til ESLint config (flat config format da vi bruger moderne setup):

```javascript
// eslint.config.js
import security from 'eslint-plugin-security';
import noSecrets from 'eslint-plugin-no-secrets';

export default [
  // ... eksisterende config
  {
    plugins: { security, 'no-secrets': noSecrets },
    rules: {
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-eval-with-expression': 'error',
      'no-secrets/no-secrets': 'error',
    },
  },
];
```

### 1.6 Git pre-commit hook (global)

Opret en global pre-commit hook der kører på alle repos:

```bash
mkdir -p ~/.git-templates/hooks
```

Opret filen `~/.git-templates/hooks/pre-commit`:

```bash
#!/opt/homebrew/bin/bash
# Global pre-commit security gate

echo "🔒 Security Gate — pre-commit scan..."

# 1. Secrets scan på staged files
if command -v gitleaks &> /dev/null; then
  gitleaks protect --staged --no-banner 2>/dev/null
  if [ $? -ne 0 ]; then
    echo "🚨 BLOCKED: Secrets detected in staged files!"
    echo "   Fjern secrets og brug .env i stedet."
    exit 1
  fi
fi

# 2. Semgrep på staged files (kun critical/error)
if command -v semgrep &> /dev/null; then
  STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx|mjs)$')
  if [ -n "$STAGED_FILES" ]; then
    echo "$STAGED_FILES" | tr '\n' '\0' | xargs -0 semgrep \
      --config p/secrets \
      --config p/owasp-top-ten \
      --severity ERROR \
      --quiet 2>/dev/null
    if [ $? -ne 0 ]; then
      echo "⚠️  Security issues found. Review findings above."
      echo "   Bypass med: git commit --no-verify (kun hvis du har reviewet manuelt)"
      exit 1
    fi
  fi
fi

echo "✅ Security gate passed."
```

Gør den executable og sæt den som global template:

```bash
chmod +x ~/.git-templates/hooks/pre-commit
git config --global init.templateDir ~/.git-templates
```

For eksisterende repos — kopier hooken ind:

```bash
cp ~/.git-templates/hooks/pre-commit ~/projekter/whop/.git/hooks/pre-commit
cp ~/.git-templates/hooks/pre-commit ~/projekter/cpm/.git/hooks/pre-commit
```

### Fase 1 — Tjekliste

- [ ] `semgrep --version` virker
- [ ] `gitleaks version` virker
- [ ] `trivy --version` virker
- [ ] ESLint security plugins installeret i mindst ét projekt
- [ ] Pre-commit hook aktiv i WHop og CPM repos
- [ ] Kør fuld Semgrep-scan mod WHop og CPM, noter findings
- [ ] Kør Gitleaks historik-scan mod alle repos, roter eventuelle lækkede secrets

---

## Fase 2 — CLAUDE.md sikkerhedsregler (manuelt + cc)

**Formål:** Giv Claude Code eksplicitte sikkerhedsregler der altid er aktive.
Manuelt: Skriv reglerne. cc: Implementér dem i kodebasen.

### 2.1 Global CLAUDE.md sikkerhedssektion

Tilføj denne sektion til den globale `~/.claude/CLAUDE.md` (gælder alle cc-sessioner):

```markdown
## Security Requirements

### Secrets & Configuration
- ALDRIG hardcode API keys, passwords, tokens eller connection strings i kode
- Brug ALTID environment variables via process.env eller dotenv
- Secrets SKAL være i .env filer der er i .gitignore
- Brug ALDRIG secrets i client-side kode (ingen NEXT_PUBLIC_ prefix på sensitive værdier)

### Authentication & Authorization
- ALLE API routes SKAL have authentication middleware
- Supabase: ALTID aktiver Row Level Security (RLS) på alle tabeller
- Firebase: ALTID konfigurer Security Rules — aldrig brug default åben konfiguration
- Brug ALDRIG client-side auth checks som eneste sikkerhedslag

### Database
- Brug ALTID parameterized queries / prepared statements
- ALDRIG string-concatenation i SQL queries
- Validér ALTID input server-side før database-operationer
- SQLite: Sæt ALTID journal_mode=WAL og foreign_keys=ON

### API Design
- Validér ALTID request body med Zod eller lignende schema validation
- Returnér ALDRIG stack traces eller interne fejlbeskeder til klienten
- Sæt ALTID CORS korrekt — aldrig wildcard (*) i production
- Rate limit ALLE offentlige endpoints

### Dependencies
- Brug ALDRIG deprecated eller arkiverede packages
- Check ALTID npm audit advisories før du tilføjer en dependency
- Foretræk well-maintained packages med høj download count
- Pin major versions i package.json

### Next.js Specifikt
- Server Actions: Validér ALTID input med Zod
- Middleware: Brug til auth-checks på beskyttede routes
- API Routes: Sæt ALTID korrekte HTTP-metoder og auth
- Brug ALDRIG dangerouslySetInnerHTML med user input
```

### 2.2 Projekt-specifikke CLAUDE.md tilføjelser

**WHop** — tilføj til `~/projekter/whop/CLAUDE.md`:

```markdown
## WHop Security

- SSH credentials ALDRIG i kode — altid Fly secrets
- Hosting-Services.xlsx ALDRIG i git (verify .gitignore)
- withSession(): Validér ALTID host parameter mod whitelist
- DNS operations: Kræv altid confirmation parameter
- LightSail API: Brug ALTID IAM med minimal privilege
- SQLite DB: Kryptér ALDRIG sensitive kundedata i plaintext
```

**CPM** — tilføj til `~/projekter/cpm/CLAUDE.md`:

```markdown
## CPM Security

- Runner/CLI: Sanitize ALTID prompt input før execution
- Headless claude -p: Kør ALDRIG med --dangerously-skip-permissions i production
- Database: Parameterized queries via Drizzle ORM — aldrig raw SQL
- Verification pipeline: Isolér browser agents — aldrig adgang til host filesystem
- API tokens: Gem ALDRIG i SQLite — brug OS keychain eller encrypted storage
```

### 2.3 Opgave til cc: Security audit af eksisterende CLAUDE.md filer

Start en cc-session med dette prompt:

```
Læs alle CLAUDE.md filer i dette projekt. Identificér manglende
sikkerhedsregler baseret på den faktiske kodebase. Foreslå
tilføjelser specifikt til dette projekts stack og arkitektur.
Output kun de foreslåede tilføjelser i markdown format.
```

### Fase 2 — Tjekliste

- [ ] Global `~/.claude/CLAUDE.md` opdateret med security-sektion
- [ ] WHop CLAUDE.md opdateret
- [ ] CPM CLAUDE.md opdateret
- [ ] Cronjobs CLAUDE.md opdateret
- [ ] cc audit-session kørt mod hvert projekt

---

## Fase 3 — @webhouse/security-gate pakke (cc bygger)

**Formål:** En shared Node.js-pakke der kan bruges på tværs af alle WebHouse-projekter.
Denne fase bygges primært af cc via en dedikeret session.

### 3.1 Arkitektur

```
@webhouse/security-gate/
├── package.json
├── README.md
├── src/
│   ├── index.ts              # Hovedeksport
│   ├── scanners/
│   │   ├── semgrep.ts        # Wrapper til semgrep CLI
│   │   ├── gitleaks.ts       # Wrapper til gitleaks CLI
│   │   ├── trivy.ts          # Wrapper til trivy CLI
│   │   ├── npm-audit.ts      # npm audit --json parser
│   │   └── custom-rules.ts   # Vores egne regler (regex + AST)
│   ├── rules/
│   │   ├── nextjs.ts         # Next.js-specifikke checks
│   │   ├── supabase.ts       # Supabase RLS verification
│   │   ├── env-check.ts      # .env/.gitignore consistency
│   │   └── api-routes.ts     # Auth middleware detection
│   ├── reporters/
│   │   ├── console.ts        # Terminal output med farver
│   │   ├── markdown.ts       # Markdown rapport (til PLAN.md)
│   │   └── discord.ts        # Discord webhook notification
│   ├── config.ts             # Konfiguration og defaults
│   └── types.ts              # TypeScript interfaces
├── bin/
│   └── security-gate.ts      # CLI entry point
└── tests/
    ├── fixtures/              # Test-projekter med kendte issues
    └── scanners/              # Unit tests for each scanner
```

### 3.2 Kernefunktionalitet

**CLI interface:**

```bash
# Fuld scan af aktuelt projekt
npx @webhouse/security-gate scan

# Kun secrets scanning
npx @webhouse/security-gate scan --only secrets

# Scan med Discord rapport
npx @webhouse/security-gate scan --report discord

# Scan ændrede filer siden sidste commit
npx @webhouse/security-gate scan --changed

# Generer markdown rapport
npx @webhouse/security-gate scan --report markdown --output SECURITY-REPORT.md
```

**Programmatisk brug:**

```typescript
import { SecurityGate } from '@webhouse/security-gate';

const gate = new SecurityGate({
  scanners: ['semgrep', 'gitleaks', 'npm-audit', 'custom-rules'],
  severity: 'error',           // minimum severity at rapportere
  reporters: ['console'],
  customRules: {
    nextjs: true,
    supabase: true,
    envCheck: true,
    apiRoutes: true,
  },
});

const results = await gate.scan('.');

if (results.critical > 0) {
  process.exit(1);             // Blokér i CI/CD
}
```

### 3.3 Custom rules (det Semgrep ikke fanger)

Disse regler er specifikke for vores stack og workflow:

**`rules/nextjs.ts`** — Checks:
- API route handlers uden auth middleware
- Server Actions uden Zod validation
- `dangerouslySetInnerHTML` med dynamisk input
- Manglende `middleware.ts` i projekter med beskyttede routes
- `NEXT_PUBLIC_` env vars der indeholder sensitive navne (key, secret, token, password)

**`rules/supabase.ts`** — Checks:
- Supabase client brugt med `service_role` key i client-side kode
- Tabeller oprettet uden RLS policies (parser SQL migrations)
- `anon` key eksponeret i ikke-.env filer

**`rules/env-check.ts`** — Checks:
- .env filer der IKKE er i .gitignore
- .env.local / .env.production eksisterer med secrets men mangler i .gitignore
- Filer der indeholder strenge der ligner API keys (entropy check)
- process.env brugt uden fallback/validation

**`rules/api-routes.ts`** — Checks:
- Next.js route handlers (app/api/**/route.ts) uden auth check
- Manglende rate limiting på offentlige endpoints
- Response bodies der indeholder stack traces eller error.message

### 3.4 Discord reporter format

```
🔒 Security Gate Report — whop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 Critical: 0
⚠️  Warning: 3
ℹ️  Info: 7

Findings:
• [WARN] src/app/api/sites/route.ts — API route uden rate limiting
• [WARN] .env.local indeholder SUPABASE_SERVICE_ROLE_KEY men er i .gitignore ✓
• [WARN] 2 npm advisories (moderate)

Scanned: 142 files in 3.2s
Full report: SECURITY-REPORT.md
```

### 3.5 Integration med cronjobs.webhouse.net

Opret et cronjob endpoint der:

1. Kloner/puller aktive repos
2. Kører `@webhouse/security-gate scan --report discord`
3. Sender rapport til Discord webhook
4. Kører dagligt eller ugentligt

Endpoint: `POST /api/jobs/security-scan`

Konfiguration i cronjobs dashboard:

```json
{
  "name": "Security Gate — All Projects",
  "schedule": "0 8 * * 1",
  "endpoint": "https://cronjobs.webhouse.net/api/jobs/security-scan",
  "repos": ["whop", "cpm", "cronjobs", "webhouse-site"],
  "discordWebhook": "process.env.DISCORD_SECURITY_WEBHOOK"
}
```

### 3.6 Integration med CPM Prompt Contracts

Standard security Acceptance Criteria der kan inkluderes i enhver Prompt Contract:

```yaml
acceptance_criteria:
  security:
    - id: SEC-001
      description: "Ingen hardcoded secrets i kodebasen"
      verification: "security-gate scan --only secrets --exit-code"
    - id: SEC-002
      description: "Alle API routes har authentication"
      verification: "security-gate scan --only api-routes --exit-code"
    - id: SEC-003
      description: "Ingen known vulnerabilities i dependencies"
      verification: "security-gate scan --only npm-audit --exit-code"
    - id: SEC-004
      description: "Supabase RLS aktiv på alle tabeller"
      verification: "security-gate scan --only supabase --exit-code"
    - id: SEC-005
      description: "Semgrep OWASP Top 10 clean"
      verification: "security-gate scan --only semgrep --exit-code"
```

### 3.7 cc-session prompt til at bygge pakken

Start cc fra en ny mappe og feed denne plan:

```bash
mkdir -p ~/projekter/security-gate
cd ~/projekter/security-gate
cat ~/SECURITY-GATE-PLAN.md | cc
```

Følg op med:

```
Byg @webhouse/security-gate pakken som beskrevet i Fase 3.
Start med package.json, tsconfig.json og den grundlæggende
scanner-arkitektur. Brug commander til CLI, chalk til output,
execa til at kalde eksterne tools (semgrep, gitleaks, trivy).
Brug ESM og TypeScript. Test med vitest.

Prioritér i denne rækkefølge:
1. CLI skeleton + config loading
2. Semgrep scanner wrapper
3. Gitleaks scanner wrapper
4. Custom rules engine (nextjs, env-check)
5. Console reporter
6. Discord reporter
7. npm-audit scanner
8. Markdown reporter
9. Supabase + api-routes custom rules
10. Tests med fixtures
```

### 3.8 Opdateret cc() bash-funktion

Når pakken er klar, opdater `~/.bashrc`:

```bash
unalias cc 2>/dev/null
cc() {
  claude --dangerously-skip-permissions "$@"
  local exit_code=$?

  # Post-session security scan
  if [ -f "package.json" ]; then
    local changed=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(js|jsx|ts|tsx|mjs)$')
    if [ -n "$changed" ]; then
      echo ""
      echo "🔒 Post-session security scan..."
      npx @webhouse/security-gate scan --changed --severity error --quiet 2>/dev/null
    fi
  fi

  return $exit_code
}
```

### Fase 3 — Tjekliste

- [ ] Pakke-skelet oprettet med cc
- [ ] Semgrep + Gitleaks wrappers virker
- [ ] Custom rules for Next.js og env-check virker
- [ ] Console + Discord reporters virker
- [ ] CLI `npx @webhouse/security-gate scan` kører succesfuldt mod WHop
- [ ] Pre-commit hook opdateret til at bruge pakken
- [ ] cc() bash-funktion opdateret
- [ ] Cronjob oprettet på cronjobs.webhouse.net
- [ ] CPM security Acceptance Criteria defineret
- [ ] Pakken publishet til npm (eller brugt lokalt via workspace link)

---

## Opsummering — hvad er manuelt vs. cc

| Opgave | Hvem |
|--------|------|
| Installer brew packages (semgrep, gitleaks, trivy) | **Manuel** |
| Opsæt global pre-commit hook | **Manuel** |
| Skriv CLAUDE.md security-sektioner | **Manuel** (med cc review) |
| Byg @webhouse/security-gate pakke | **cc** |
| Custom rules for Next.js/Supabase/env | **cc** |
| Console + Discord reporters | **cc** |
| CLI interface | **cc** |
| Cronjob integration | **cc** |
| CPM Acceptance Criteria templates | **Manuel** + **cc** |
| Test og validering mod aktive repos | **Manuel** |

---

## Fremtidige udvidelser (v2)

- GitHub Actions workflow der kører security-gate på PR
- Supabase RLS policy generator baseret på schema
- Auto-fix mode for simple findings (f.eks. tilføj .env til .gitignore)
- Dashboard i WHop med historiske scan-resultater
- Integration med OWASP ZAP for dynamisk scanning af staging
- Fly.io deploy hook der blokerer deploy ved critical findings
