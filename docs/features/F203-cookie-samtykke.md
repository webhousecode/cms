# F203 — Cookie-samtykke på cms' live sites

**Ordre:** Christian 29/9-2026, videresendt af components: «rul det ud til alle live sites». Hvert live website skal have cookie-banneret `@broberg/consent-cookie`.

## Motivation
Et site der sætter sporings-cookies eller loader trackere før besøgende har sagt ja, bryder cookie-reglerne. Målt 29/9: docs.webhouse.app loader Microsoft Clarity på hver side uden samtykke — det er ikke kosmetik, det er et reelt brud i dag.

## Scope — de tre sites cms ejer
| Site | Repo | Tracker i dag |
|---|---|---|
| webhouse.app (offentlig forside) | cms / packages/cms-admin | ingen fundet |
| docs.webhouse.app | cms-docs (Fly `cms-docs`) | **Microsoft Clarity**, Vimeo-embeds |
| www.webhouse.dk | webhouse-site (Fly `webhouse-dk`) | ingen fundet |

**Non-goals:** broberg.ai (broberg-ai-sessionen), sanneandersen (egen session), fd-sport/fd-sundhed (egne sessioner). /admin-fladerne i webhouse.app får IKKE banneret (login-app, ikke website) — og login/betaling mærkes aldrig som tracker.

## Arkitektur (opskrift fra components)
1. `@broberg/consent-cookie@0.4.1` exact-pin.
2. `import "@broberg/consent-cookie/element"` i en client-komponent (Next).
3. `<broberg-consent policy-version="2026-09" privacy-href="…">`, `lang="en"` på engelske sider.
4. Trackere spærres til ja: `<script type="text/plain" data-consent="analytics">`, iframes `data-consent-src`.
5. Map sitets farver til `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--muted-foreground`, `--border`, `--secondary` på elementet.
6. Knappen «Cookies» nederst til venstre; flyttes hvis den dækker noget (inline-edit).

## Åbne spørgsmål
- Har hvert site en privatlivsside at pege `privacy-href` på? Mangler den, skal den skrives — og teksten skal ligge i CMS (husregel).

## Bevis (pr. site)
Lens mod PROD-URL: første besøg viser banneret, «Afvis alle» gemmer cookien `broberg-consent`, et mærket script kører ikke før samtykke, tekst/knapper kan læses. Svar components med URL, version, Lens-run-id; enrollér i Discovery.

## Reuse
`@broberg/consent-cookie` (owner components) — intet bygges selv.

## Rollout
Ét site ad gangen, docs.webhouse.app først (den med den aktive tracker).
