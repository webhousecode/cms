  F108 Rich Text Editor Enhancements
  - Editor zoom (50-200%), AI Proofread, Table context toolbar

  Status:
  - F109 Inline Proofreading er planlagt (ProseMirror decorations)
  - OG auto-generate virker men kun med eksisterende billeder — mangler
    fallback/generering når der intet billede er i content


⏺ Her er de åbne Tier 1 features sorteret efter impact:

  ┌─────┬────────────────────────┬─────────────┬───────────────────────────────────────────────────────────────────┐
  │  #  │        Feature         │    Size     │                              Status                               │
  ├─────┼────────────────────────┼─────────────┼───────────────────────────────────────────────────────────────────┤
  │ F83 │ Vibe Site Builder      │ Large       │ THE differentiator — "Describe → Generate → Manage"               │
  ├─────┼────────────────────────┼─────────────┼───────────────────────────────────────────────────────────────────┤
  │ F79 │ Site Config Validator  │ Medium      │ Kritisk for AI-byggede sites — venlige fejl i stedet for ZodError │
  ├─────┼────────────────────────┼─────────────┼───────────────────────────────────────────────────────────────────┤
  │ F12 │ One-Click Publish      │ In progress │ Vercel/Netlify hooks mangler test                                 │
  ├─────┼────────────────────────┼─────────────┼───────────────────────────────────────────────────────────────────┤
  │ F42 │ Framework Boilerplates │ Medium      │ Starter templates + Claude Code skills                            │
  ├─────┼────────────────────────┼─────────────┼───────────────────────────────────────────────────────────────────┤
  │ F99 │ E2E Testing Suite      │ Large       │ 10 Playwright suites, regression catching                         │
  ├─────┼────────────────────────┼─────────────┼───────────────────────────────────────────────────────────────────┤
  │ F31 │ Documentation Site     │ Medium      │ Kan ikke shippe uden docs                                         │
  └─────┴────────────────────────┴─────────────┴───────────────────────────────────────────────────────────────────┘

Vercel

  1. Gå til vercel.com → opret et nyt projekt
  2. Import et af boilerplate repos: webhousecode/nextjs-boilerplate
  3. Når projektet er deployet, gå til Project → Settings → Git → Deploy Hooks
  4. Opret en hook (f.eks. "CMS Deploy") → kopier URL'en (format: https://api.vercel.com/v1/integrations/deploy/...)
  5. Giv mig URL'en, så sætter jeg den op i CMS admin og tester
  https://api.vercel.com/v1/integrations/deploy/prj_yNds4bnmWp2RO1LoF63qG7pVaAZ4/ycKG6W6KWx
  

  Netlify

  1. Gå til netlify.com → opret et nyt site
  2. Import samme repo: webhousecode/nextjs-boilerplate
  3. Når sitet er deployet, gå til Site → Build & deploy → Build hooks
  4. Opret en hook → kopier URL'en
  5. Giv mig URL'en
  https://api.netlify.com/build_hooks/69c7d558e51acbea9672b33d

  Begge tager ca. 2 minutter at sætte op. Når jeg har hook URL'erne kan jeg:
  - Konfigurere dem i CMS admin Site Settings → Deploy
  - Teste "Deploy now" knappen
  - Verificere at bygget triggers korrekt
  - Tjekke deploy history logging

  Fortsæt CMS udvikling. Roadmap: docs/ROADMAP.md. Features: docs/FEATURES.md.

  Remaining Tier 1 (ship blockers):
  - F27 Backup & Restore — In progress (backup works, GitHub restore missing)
  - F80 Admin Selector Map — Medium (data-testid foundation for E2E)
  - F83 Vibe Site Builder — Large (THE differentiator)
  - F31 Documentation Site — Medium (can't ship without docs)

  Other open items:
  - F93 Phase 2: Vercel/Netlify OAuth integration (seamless deploy)
  - 88 MEDIUM findings fixed (role checks), but scanner should be re-run to verify
  - Map TipTap node needs resize/drag handle polish
  - npm packages at v0.2.13

  Vigtige regler:
  - INGEN quick-fixes — find og ret root cause
  - Feature process: Risk Assessment → Tests → Implementation → Test → Deploy
  - ALDRIG router.push for org/site switch — altid window.location.href
  - ALDRIG native <select> — altid CustomSelect
  - Security: ALL /api/* routes are middleware-protected, write endpoints need denyViewers()
  - Commit + push efter significant work blocks

