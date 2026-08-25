# F172 — Fem afhængigheder er frosset fast uden at nogen har besluttet det

**Status:** backlog · **Fundet:** 25. august 2026

## Fælden

`"^0.13.0"` ser ud som «0.13 eller nyere». Det er det ikke. På et 0.x-nummer låser caret **minoren** — `^0.13.0` kan nå 0.13.9 og aldrig 0.14.0. Så en afhængighed man tror følger med, står stille indtil nogen skriver et nyt tal i hånden.

upmetrics faldt i den selv i dag (deres server sad på `^0.1.4` og havde misset fire rettelser siden juni), og buddy fandt den to steder mere. Målt her:

| pakke | vi kører | nyeste | efter |
|---|---|---|---|
| **`@broberg/ai-sdk`** | `^0.13.0` | **0.28.0** | **15 minorer** |
| `drizzle-orm` | `^0.38.3` / `^0.38.4` | 0.45.2 | 7 minorer |
| `sharp` | `^0.34.5` | 0.35.3 | 1 minor |
| `citty` | `^0.1.6` | 0.2.2 | 1 minor |
| `lucide-react` | `^0.577.0` | 1.34.0 | over 1.0 |

De øvrige fem `^0.x`-afhængigheder er allerede på nyeste.

## Hvorfor `@broberg/ai-sdk` er den vigtige

Den er flådens AI-gateway — hver eneste LLM-kald i cms går igennem den, og den bærer omkostningssporing, GDPR-routing og `resolveModel()`-porten der forhindrer at vi starter noget på en model der er taget ud af drift. Vi har stået stille på den siden juni, hvor den blev bumpet for at lukke en fejl hvor `system`-beskeden aldrig blev leveret.

Femten minorer er ikke «lidt bagud». Det er et halvt års rettelser og nye modeller vi ikke har, på præcis det stykke der skal beskytte os mod at bruge penge forkert.

## Det er ikke ét stykke arbejde

De fem er vidt forskellige i risiko, og de skal ikke bumpes i én omgang:

- **`@broberg/ai-sdk`** — højst værdi, moderat risiko. Alle AI-flader skal afprøves efter (chat, agenter, SEO, oversættelse, interaktive). Egen historik siger at netop denne pakke har haft en fejl der kun viste sig i drift.
- **`drizzle-orm`** — rører databasen. Syv minorer, og cms-admin og cms skal følges ad. Kræver sin egen runde med skemaet efterprøvet.
- **`sharp`** — billedbehandling, native binærfil. Lav risiko for API, højere for byggeriet i Docker.
- **`citty`** — kun CLI'en.
- **`lucide-react`** — 0.x → 1.x er reelt et hovedspring; ikonnavne kan være væk.

## Spærren, som er det egentlige leverance

En liste over forældede pakker er forældet i næste uge. En **test der fejler** når en `^0.x`-afhængighed er mere end én minor bagud, er det ikke — den fortæller det af sig selv, hver gang nogen kører testene, i stedet for at vente på at nogen kommer i tanke om at kigge.

Undtagelser skal være **navngivne og begrundede** i selve testen (fx «lucide-react holdes bevidst på 0.577 indtil ikonnavnene er gennemgået»), ikke en stiltiende accept af at tallet skrider.
