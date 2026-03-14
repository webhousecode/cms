# Trusted Publishing Setup

npm trusted publishing bruger GitHub Actions OIDC — ingen tokens eller secrets nødvendige.

## Sådan virker det

1. GitHub Actions runner anmoder om et OIDC-token fra GitHub
2. npm verificerer at tokenet kommer fra den tilladte repo + workflow + environment
3. Pakken publiceres med provenance (verificerbar supply chain)

## Opsætning (éngangs, per package)

### GitHub

1. Gå til **Settings → Environments → New environment**
2. Navn: `npm`
3. Ingen secrets, ingen protection rules

### npm (gentag for hver package)

1. Gå til `npmjs.com/package/@webhouse/<pakke>` → **Settings**
2. Under **Trusted Publisher** → klik **Add**
3. Udfyld:
   - Publisher: **GitHub Actions**
   - Organization or user: `webhousecode`
   - Repository: `cms`
   - Workflow filename: `publish.yml`
   - Environment name: `npm`
4. Klik **Set up connection**

### Packages der skal konfigureres

- `@webhouse/cms`
- `@webhouse/cms-ai`
- `@webhouse/cms-cli`
- `@webhouse/cms-mcp-client`
- `@webhouse/cms-mcp-server`
- `@webhouse/create-cms`

> npm har ingen API til at automatisere trusted publisher setup — det skal gøres manuelt i UI'et én gang per package. Herefter kræver nye releases ingen manuel handling.

## Release (efter opsætning)

Kør workflow manuelt fra GitHub Actions:

```
Actions → Publish to npm → Run workflow → version: patch/minor/major/0.2.0
```

Eller via CLI:

```bash
gh workflow run publish.yml -f version=patch
```

Workflowet:
1. Bygger alle packages
2. Kører tests
3. Bumper version i alle 6 packages
4. Publisher i dependency-rækkefølge med OIDC provenance
5. Restorer `workspace:*` deps
6. Committer version bump + git tag
