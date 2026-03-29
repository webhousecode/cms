# MCP ↔ Chat Tool Parity Analysis

> Hvad skal til for at Claude Desktop kan alt det samme som vores inline chat?

## Status quo

| | MCP Admin Server | Chat (inline) |
|---|---|---|
| Tools | 15 | 40+ |
| Transport | SSE over HTTP | SSE over HTTP |
| Auth | Bearer API key | JWT session cookie |
| Context | Ingen site schema i prompt | Full schema + brand voice + memory |
| Streaming | Nej (request/response) | Ja (SSE med thinking) |

## Tool Gap: 25+ manglende tools i MCP

### Kategori 1: Media (0 i MCP, 2 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `list_media` | List billeder/filer med EXIF, tags, GPS | Høj |
| `search_media` | Søg i media bibliotek | Høj |

### Kategori 2: Agents & Curation (0 i MCP, 5 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `list_agents` | Vis alle AI-agenter | Medium |
| `create_agent` | Opret ny agent | Medium |
| `run_agent` | Kør en agent | Medium |
| `list_curation_queue` | Vis agent-genereret indhold til review | Medium |
| `approve_queue_item` / `reject_queue_item` | Godkend/afvis | Medium |

### Kategori 3: Scheduling & Calendar (0 i MCP, 2 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `list_scheduled` | Vis planlagt indhold | Medium |
| `schedule_publish` | Planlæg publicering til dato | Høj |

### Kategori 4: Bulk Operations (0 i MCP, 2 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `bulk_publish` | Publicer mange dokumenter på én gang | Høj |
| `bulk_update` | Opdater felter på mange dokumenter | Høj |

### Kategori 5: Trash & Recovery (0 i MCP, 4 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `trash_document` | Flyt til papirkurv | Høj |
| `list_trash` | Vis papirkurv | Medium |
| `restore_from_trash` | Gendan fra papirkurv | Medium |
| `empty_trash` | Tøm papirkurv | Lav |

### Kategori 6: Tools & Maintenance (0 i MCP, 4 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `run_link_check` | Kør link checker | Medium |
| `create_backup` | Opret backup | Medium |
| `content_stats` | Statistik over indhold | Lav |
| `list_deploy_history` | Vis deploy historik | Lav |

### Kategori 7: Settings & Config (0 i MCP, 2 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `get_site_config` | Læs site konfiguration | Medium |
| `update_site_settings` | Opdater indstillinger | Lav |

### Kategori 8: Interactives (0 i MCP, 1 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `generate_interactive` | Generer HTML micro-app | Lav |

### Kategori 9: Cloning (0 i MCP, 1 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `clone_document` | Klon et dokument | Medium |

### Kategori 10: Translation (0 i MCP, 2 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `translate_document` | Oversæt ét dokument | Høj (efter F48) |
| `translate_site` | Oversæt hele sitet | Høj (efter F48) |

### Kategori 11: Memory (0 i MCP, 3 i chat)
| Chat tool | Hvad den gør | MCP prioritet |
|-----------|-------------|---------------|
| `search_memories` | Søg i chat memory | Lav |
| `add_memory` | Tilføj memory | Lav |
| `forget_memory` | Fjern memory | Lav |

### Kategori 12: UI-only (kan IKKE flyttes til MCP)
| Chat tool | Hvorfor den ikke giver mening i MCP |
|-----------|--------------------------------------|
| `show_edit_form` | Renderer en inline form i chat UI — ingen pendant i Claude Desktop |

## Anbefaling: 3-fase udrulning

### Fase 1 — Høj prioritet (15 nye tools → 30 total)
Giver Claude Desktop fuld content management:

```
list_media, search_media,
trash_document, clone_document,
bulk_publish, bulk_update, schedule_publish,
list_scheduled, list_revisions (rename get_version_history),
list_trash, restore_from_trash,
get_site_config,
list_deploy_history,
content_stats,
trigger_deploy (alias for trigger_build med deploy mode)
```

**Estimat:** 2-3 dage — tools eksisterer allerede i chat, skal bare wrappes med MCP scope-check + audit log.

### Fase 2 — Agent & Curation (5 tools → 35 total)
Giver Claude Desktop kontrol over AI-agenter:

```
list_agents, create_agent, run_agent,
list_curation_queue, approve_queue_item, reject_queue_item
```

**Estimat:** 1-2 dage

### Fase 3 — Advanced (5+ tools → 40+ total)
```
translate_document, translate_site (efter F48),
generate_interactive,
update_site_settings,
run_link_check, create_backup, empty_trash
```

**Estimat:** 1-2 dage

## Arkitektonisk approach

### Delt tool-kode (anbefalet)

I dag er chat tools og MCP tools implementeret **uafhængigt** — de kalder begge de samme CMS API'er, men tool-definitionerne er duplikeret. Det er uholdbart med 40+ tools.

**Forslag:** Opret et shared tool registry der bruges af BÅDE chat og MCP:

```typescript
// packages/cms-admin/src/lib/tools/registry.ts

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: object;
  scopes: string[];  // MCP scopes: ["read"], ["write"], ["write", "ai"], etc.
  handler: (input: Record<string, unknown>) => Promise<string>;
}

// Bruges af chat:
export function getChatTools(): ToolDefinition[]

// Bruges af MCP:
export function getMcpTools(scopes: string[]): ToolDefinition[]
```

Fordele:
- Én definition per tool, to consumers
- Scope-filtrering sker automatisk
- Nye tools er øjeblikkeligt tilgængelige i begge interfaces
- Tool-beskrivelser og input schemas er altid synkroniserede

### System prompt / context gap

MCP-serveren sender **ingen system prompt** — Claude Desktop har sin egen. Det betyder at MCP-brugere ikke får:
- Schema-awareness (hvilke collections og felter der findes)
- Brand voice context
- Chat memory (F114)
- Help docs (F115)

**Løsning:** Tilføj et `get_chat_context` tool der returnerer det samme context som chat's system prompt. Claude Desktop-brugere kan starte med: "Hent context om mit site" → AI'en kalder `get_chat_context` og får fuld schema + capabilities.

Alternativt: MCP resources (ikke tools) der automatisk sendes til klienten.

## Konklusion

**Det er muligt i dag** at bruge Claude Desktop med vores MCP — men kun med 15 basis-tools. For fuld paritet med inline chat:

1. **Fase 1** (2-3 dage): 15 nye tools → content management paritet
2. **Fase 2** (1-2 dage): Agent tools → automation paritet
3. **Fase 3** (1-2 dage): Advanced tools → fuld paritet
4. **Shared registry** (2-3 dage): Eliminerer duplikering permanent
5. **Context tool** (1 dag): Schema + memory tilgængelig via MCP

Total: **~10 dage** for fuld MCP ↔ Chat paritet + shared arkitektur.

Anbefaling: Gør det som en ny feature (F116?) der bygger shared tool registry + Fase 1-3.
