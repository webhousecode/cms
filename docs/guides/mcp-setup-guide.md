# MCP Setup Guide — Forbind Claude Desktop med dit CMS site

> Denne guide forklarer hvordan en redaktør, udvikler eller AI-agent kan "snakke" med et webhouse.app site fra Claude Desktop, Cursor, eller en terminal-baseret AI.

## Hvad er MCP?

MCP (Model Context Protocol) er en åben standard der lader AI-assistenter som Claude Desktop, Cursor og andre tools forbinde direkte til dit CMS. I stedet for at copy-paste indhold ind i en chat, kan AI'en selv slå op i dine sider, søge i indhold, oprette posts og meget mere.

webhouse.app har **to MCP servere** indbygget:

| Server | Auth | Rettigheder | Brug |
|--------|------|-------------|------|
| **Public** (`/api/mcp`) | Ingen | Kun læsning af published content | Chatbots, frontend widgets, offentlige AI-agenter |
| **Admin** (`/api/mcp/admin`) | API-nøgle | Læs + skriv + AI + deploy | Claude Desktop, Cursor, redaktør-tools |

---

## Forudsætninger

- Et kørende webhouse.app site (lokalt eller deployed)
- Claude Desktop (macOS/Windows) eller Cursor IDE
- Admin-adgang til CMS'et (for at generere API-nøgle)

---

## Trin 1: Generer en API-nøgle

1. Åbn CMS admin → **Settings** → **MCP** tab
2. Klik **"Generate new key"**
3. Giv nøglen et label (f.eks. "Claude Desktop — Christian")
4. Vælg scopes:
   - **read** — slå op i indhold, sider, schema (altid påkrævet)
   - **write** — opret og rediger dokumenter
   - **publish** — publicer/afpublicer
   - **deploy** — trigger build og deploy
   - **ai** — AI-generering og omskrivning
5. Kopier nøglen — **den vises kun én gang**

> **Tip:** Giv en redaktør kun `read + write`, og behold `publish + deploy + ai` til admin-brugere.

---

## Trin 2: Konfigurer Claude Desktop

### macOS

Åbn Claude Desktop → **Settings** → **Developer** → **Edit Config**

Eller rediger filen direkte:
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Windows

```
%APPDATA%\Claude\claude_desktop_config.json
```

### Konfiguration

#### Til et lokalt site (localhost:3010):

```json
{
  "mcpServers": {
    "mit-site": {
      "url": "http://localhost:3010/api/mcp/admin",
      "headers": {
        "Authorization": "Bearer DIN_API_NØGLE_HER"
      }
    }
  }
}
```

#### Til et deployed site:

```json
{
  "mcpServers": {
    "mit-site": {
      "url": "https://dit-site.webhouse.app/api/mcp/admin",
      "headers": {
        "Authorization": "Bearer DIN_API_NØGLE_HER"
      }
    }
  }
}
```

> **Vigtigt:** Udskift `DIN_API_NØGLE_HER` med den nøgle du genererede i Trin 1.

### Genstart Claude Desktop

Luk og åbn Claude Desktop. Du bør nu se dit site i MCP-menuen (hammerikon i bunden af chatfeltet).

---

## Trin 3: Konfigurer Cursor IDE

Opret `.cursor/mcp.json` i dit projekt:

```json
{
  "mcpServers": {
    "mit-site": {
      "url": "http://localhost:3010/api/mcp/admin",
      "headers": {
        "Authorization": "Bearer DIN_API_NØGLE_HER"
      }
    }
  }
}
```

Genstart Cursor. MCP-tools vises i Cursor's AI-panel.

---

## Trin 4: Test forbindelsen

I Claude Desktop, skriv:

> "Giv mig et overblik over mit site"

Claude vil kalde `get_site_summary` og fortælle dig om dine collections, antal dokumenter, og site-konfiguration.

Prøv også:

| Prompt | Tool der bruges |
|--------|-----------------|
| "Vis alle mine blog posts" | `list_collection` |
| "Søg efter artikler om skiing" | `search_content` |
| "Vis mig hele about-siden" | `get_page` |
| "Hvilke felter har min posts collection?" | `get_schema` |
| "Opret en ny blog post om foråret" | `create_document` |
| "Publicer min seneste draft" | `publish_document` |
| "Generer en artikel om Copenhagen" | `generate_with_ai` |
| "Omskriv meta-beskrivelsen på about-siden" | `rewrite_field` |
| "Byg og deploy sitet" | `trigger_build` |

---

## Trin 5: Public MCP (valgfrit — til chatbots)

Hvis du vil lade en chatbot eller offentlig AI læse dit publisherede indhold (uden write-adgang), brug den offentlige endpoint:

```json
{
  "mcpServers": {
    "mit-site-public": {
      "url": "https://dit-site.webhouse.app/api/mcp"
    }
  }
}
```

Ingen API-nøgle nødvendig. Rate limited til 60 requests/minut. Kun published content.

---

## Terminal / CLI Bridge

For terminal-baserede AI-tools (Claude Code, aider, etc.) der understøtter MCP:

```bash
# Test med curl (public endpoint)
curl -N https://dit-site.webhouse.app/api/mcp

# Test admin endpoint
curl -N -H "Authorization: Bearer DIN_NØGLE" \
  https://dit-site.webhouse.app/api/mcp/admin
```

For Claude Code kan du tilføje MCP serveren i `.mcp.json`:

```json
{
  "mcpServers": {
    "mit-site": {
      "type": "sse",
      "url": "http://localhost:3010/api/mcp/admin",
      "headers": {
        "Authorization": "Bearer DIN_API_NØGLE_HER"
      }
    }
  }
}
```

---

## Tilgængelige tools (Admin MCP)

| Tool | Beskrivelse | Scope |
|------|-------------|-------|
| `get_site_summary` | Overblik: collections, doc count, locale info | read |
| `list_collection` | List dokumenter i en collection (pagineret, sorteret) | read |
| `search_content` | Fuldtekst-søgning i alt published indhold | read |
| `get_page` | Hent et helt dokument som Markdown | read |
| `get_schema` | Vis felter og typer for en collection | read |
| `export_all` | Eksporter alt published indhold som JSON | read |
| `list_drafts` | Vis alle upublicerede dokumenter | read |
| `get_version_history` | Vis revisionshistorik for et dokument | read |
| `create_document` | Opret nyt dokument | write |
| `update_document` | Opdater eksisterende dokument | write |
| `publish_document` | Publicer et dokument | publish |
| `unpublish_document` | Sæt dokument til draft | publish |
| `generate_with_ai` | AI-generer indhold til et nyt dokument | write + ai |
| `rewrite_field` | Omskriv et felt med AI-instruktion | write + ai |
| `trigger_build` | Byg site (full eller incremental) | deploy |

---

## Fejlfinding

### "No MCP tools visible in Claude Desktop"
- Tjek at URL'en er korrekt (inkl. `/api/mcp/admin`)
- Tjek at API-nøglen er gyldig (kopier den frisk fra Settings → MCP)
- Genstart Claude Desktop efter config-ændringer

### "403 Forbidden"
- API-nøglen mangler eller er forkert
- Header skal være `Authorization: Bearer <nøgle>` (med mellemrum efter Bearer)

### "Scope not allowed"
- Din API-nøgle har ikke de nødvendige scopes
- Gå til Settings → MCP og tilføj de manglende scopes

### "Rate limited" (public endpoint)
- Maks 60 requests/minut per IP
- Brug admin endpoint med API-nøgle for højere limits

### Lokalt site ikke tilgængeligt
- Sørg for at CMS admin kører (`pnpm dev` i packages/cms-admin)
- Default port er 3010: `http://localhost:3010`

---

## Sikkerhed

- **API-nøgler er hemmeligheder** — del dem aldrig i offentlige repos eller chats
- **Brug mindste nødvendige scope** — en redaktør behøver sjældent `deploy` eller `ai`
- **Audit log** — alle MCP-operationer logges i `_data/mcp-audit.jsonl`
- **Revokér ubrugte nøgler** — fjern nøgler for folk der ikke længere har adgang
- **HTTPS i produktion** — brug altid HTTPS til deployed sites (API-nøgler sendes i headers)
