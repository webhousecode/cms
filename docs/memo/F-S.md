⏺ Tier 2 — Rent funktionelle (ingen i18n-afhængighed)

  ┌──────────────────────────────┬────────┬───────────────────────────────────────┐
  │           Feature            │  Size  │                 Hvad                  │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F83 Vibe Site Builder        │ Large  │ AI site generation                    │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F63 Shared Components        │ Medium │ Design tokens, shared UI, API helpers │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F84 Move Site to Org         │ Small  │ Flyt site mellem orgs                 │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F38 Environment Manager      │ Medium │ Dev/Staging/Prod                      │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F13 Notification Channels    │ Small  │ Discord/Slack/webhook notifs          │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F35 Webhooks                 │ Small  │ Outbound events                       │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F61 Activity Log             │ Medium │ Audit trail                           │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F40 Drag and Drop Tabs       │ Small  │ Tab UX polish                         │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F52 Custom Column Presets    │ Medium │ Drag-resize kolonner                  │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F53 Drag & Drop Blocks       │ Medium │ dnd-kit block reorder                 │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F04 MCP Enhancements         │ Small  │ Flere tools                           │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F54 Local AI Tunnel          │ Small  │ AI via CC subscription                │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F81 Homepage Designation     │ Small  │ "Set as homepage" setting             │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F82 Loaders & Spinners       │ Medium │ Shimmer skeletons, spinners           │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F92 Desktop PWA              │ Small  │ Installér som desktop app             │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F94 Favorites                │ Small  │ Heart-toggle, sidebar sektion         │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F95 Cloud Backup Providers   │ Medium │ pCloud, R2, B2 etc.                   │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F98 Lighthouse Audit         │ Medium │ PSI scores, dashboard                 │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F49 Incremental Builds       │ Small  │ Performance                           │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F110 Digital Island Apps     │ Medium │ AI micro-apps via chat                │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F55 Enhance Prompt           │ Small  │ Magic wand prompt rewrite             │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F60 Reliable Scheduled Tasks │ Small  │ Heartbeat + external cron             │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F72 Website Screenshots      │ Medium │ Playwright visual QA                  │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F66 Search Index             │ Medium │ SQLite FTS5                           │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F85 CC Hooks & Quality Gates │ Small  │ Auto type-check, guards               │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F88 MCP Server Validation    │ Small  │ Test MCP connection                   │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F93 Next.js App Deployment   │ Medium │ SSR deploy                            │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F100 Custom Domain DNS       │ Small  │ DNS validation                        │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F101 Update Manager          │ Medium │ Version check + update banner         │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F104 Performance & Data Opt  │ Medium │ SQLite cache, pagination              │
  ├──────────────────────────────┼────────┼───────────────────────────────────────┤
  │ F109 Inline Proofreading     │ Medium │ ProseMirror corrections               │
  └──────────────────────────────┴────────┴───────────────────────────────────────┘

  Tier 3 — Rent funktionelle

  ┌───────────────────────────┬────────┬────────────────────────────┐
  │          Feature          │  Size  │            Hvad            │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F46 Plugin System         │ Large  │ registerPlugin(), hooks    │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F45 AI Image Generation   │ Medium │ Flux/DALL-E                │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F30 Form Engine           │ Medium │ Kontaktformularer          │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F29 Transactional Email   │ Medium │ Password reset, invites    │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F08 RAG Knowledge Base    │ Large  │ AI grounded i site content │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F09 Chat Plugin           │ Medium │ AI chat widget             │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F37 HTML Document Field   │ Medium │ Visual HTML editor         │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F58 Interactive Islands   │ Medium │ Preact micro-apps          │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F25 Storage Buckets       │ Medium │ S3, R2 storage             │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F56 GitHub Live Content   │ Large  │ Bidirectional repo sync    │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F68 Shop Plugin           │ XL     │ Stripe e-commerce          │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F71 Multi-Player Editing  │ Small  │ Document locking           │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F73 Troubleshooting Guide │ Small  │ In-app help                │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F74 System Status Page    │ Small  │ Health checks              │
  ├───────────────────────────┼────────┼────────────────────────────┤
  │ F105 Voice Module         │ Large  │ Stemmekommandoer           │
  └───────────────────────────┴────────┴────────────────────────────┘