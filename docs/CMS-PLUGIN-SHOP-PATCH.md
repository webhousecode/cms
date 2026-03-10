# AI-Guide × CMS Shop Plugin — Integration Patch
> WebHouse CMS · Sanne Andersen · Marts 2026  
> Forfatter: Christian Broberg · cb@webhouse.dk

---

## Formål

Dette dokument specificerer de krav og kontrakter der **skal implementeres i CMS shop-pluginet** for at AI-guiden (RAG-agenten) kan:

1. Søge i produktkataloget og returnere relevante produkter til en bruger
2. Vise **mini product cards** direkte inde i chat-boblen
3. Lægge produkter i brugerens kurv med ét bekræftelsessvar
4. Håndtere session og kurv på tværs af chat og checkout

Dokumentet er et **patch til CMS shop-pluginets API-specifikation** — ikke en komplet shop-spec.

---

## 1. Arkitektur-overblik

```
Bruger ──► Chat UI
              │
              ▼
          AI Agent (Claude + RAG)
              │
         tool_call: shop_search()
         tool_call: shop_add_to_cart()
              │
              ▼
        CMS Shop Plugin API  ──►  Stripe / MobilePay
              │
              ▼
          Cart Session (cookie/token)
```

AI-agenten interagerer med shoppen via **to tool-kald** defineret som Claude-værktøjer. Shoppen skal eksponere de tilhørende REST-endpoints. Chat UI-laget renderer svaret som mini product cards når AI-agentens svar indeholder et `products`-array.

---

## 2. Krav til Shop Plugin API

### 2.1 Produkt-søgning — `GET /api/shop/search`

AI-agenten kalder dette endpoint med en semantisk forespørgsel og modtager et produkt-array optimeret til chat-rendering.

**Request:**
```http
GET /api/shop/search?q=zoneterapi+gavekort&limit=3&category=gavekorter
Authorization: Bearer {ai-agent-token}
```

| Parameter | Type | Påkrævet | Beskrivelse |
|---|---|---|---|
| `q` | string | Ja | Semantisk søgetekst fra brugeren |
| `limit` | int | Nej | Max antal resultater (default 3, max 5) |
| `category` | string | Nej | Filtrér på produktkategori |
| `tags` | string | Nej | Kommaseparerede tags |

**Response — `200 OK`:**
```json
{
  "results": [
    {
      "id": "prod_gk_zoneterapi_60",
      "name": "Gavekort — Zoneterapi 60 min",
      "slug": "gavekort-zoneterapi-60",
      "price": 70000,
      "price_display": "700 kr",
      "currency": "DKK",
      "category": "gavekorter",
      "tags": ["gavekort", "zoneterapi", "digital"],
      "short_description": "Digitalt gavekort til én zoneterapi-behandling hos Sanne Andersen. Sendes direkte til modtagerens email.",
      "image_url": "https://sanneandersen.dk/shop/img/gk-zoneterapi.webp",
      "image_alt": "Gavekort til zoneterapi",
      "availability": "in_stock",
      "delivery_type": "digital",
      "url": "https://sanneandersen.dk/shop/gavekort-zoneterapi-60",
      "add_to_cart_token": "act_abc123xyz"
    }
  ],
  "total": 1,
  "query": "zoneterapi gavekort"
}
```

**Kritiske felter til AI-rendering:**

| Felt | Formål |
|---|---|
| `id` | Bruges til `add_to_cart`-kaldet |
| `price_display` | Vises direkte i product card — forudformateret |
| `short_description` | Max 120 tegn — AI inkluderer dette i chat-svar |
| `image_url` | WebP, min. 400×300px, tillader hotlinking fra chat |
| `add_to_cart_token` | Short-lived token (15 min) — undgår at AI har direkte skriveadgang til kurv uden brugerbekræftelse |
| `availability` | `in_stock` \| `out_of_stock` \| `on_demand` |
| `delivery_type` | `digital` \| `physical` \| `booking` — bruges til at AI formulerer svaret korrekt |

---

### 2.2 Læg i kurv — `POST /api/shop/cart/add`

Kaldes **kun efter** at brugeren eksplicit har bekræftet ("Ja tak", "Tilføj", osv.) i chatten.

**Request:**
```http
POST /api/shop/cart/add
Authorization: Bearer {ai-agent-token}
Content-Type: application/json

{
  "session_id": "sess_visitor_abc123",
  "product_id": "prod_gk_zoneterapi_60",
  "add_to_cart_token": "act_abc123xyz",
  "quantity": 1,
  "options": {
    "recipient_name": "Mette Hansen",
    "recipient_email": "mette@example.com",
    "gift_message": "Tillykke med fødselsdagen!"
  }
}
```

| Felt | Type | Påkrævet | Beskrivelse |
|---|---|---|---|
| `session_id` | string | Ja | Visitor session fra chat-initialisering |
| `product_id` | string | Ja | Fra søgeresultat |
| `add_to_cart_token` | string | Ja | Engangstoken fra søgeresultat — udløber 15 min |
| `quantity` | int | Ja | Default 1 |
| `options` | object | Nej | Produktspecifikke options (gavekort, behandlingstype m.m.) |

**Response — `200 OK`:**
```json
{
  "success": true,
  "cart": {
    "item_count": 1,
    "total_display": "700 kr",
    "checkout_url": "https://sanneandersen.dk/shop/checkout?cart=sess_visitor_abc123",
    "items": [
      {
        "product_id": "prod_gk_zoneterapi_60",
        "name": "Gavekort — Zoneterapi 60 min",
        "price_display": "700 kr",
        "quantity": 1
      }
    ]
  },
  "message": "Tilføjet til kurven"
}
```

**Response — `410 Gone` (udløbet token):**
```json
{
  "success": false,
  "error": "token_expired",
  "message": "Produktlinket er udløbet. Søg igen for at tilføje til kurven."
}
```

---

### 2.3 Session-initialisering — `POST /api/shop/session`

Kaldes af Chat UI ved første sideindlæsning for at binde visitor til en kurv-session **før** AI-agenten bruges.

**Request:**
```http
POST /api/shop/session
Content-Type: application/json

{
  "visitor_id": "vis_fingerprint_xyz"
}
```

**Response:**
```json
{
  "session_id": "sess_visitor_abc123",
  "expires_at": "2026-03-10T23:59:59Z"
}
```

`session_id` gemmes i chat-konteksten og sendes med alle efterfølgende `add_to_cart`-kald.

---

## 3. AI-Agent Tool Definitions

Disse to tool-definitioner indsættes i Claude-agentens system-prompt / tool-konfiguration.

### Tool 1: `shop_search`

```json
{
  "name": "shop_search",
  "description": "Søg i Sanne Andersens produktkatalog. Brug dette tool når brugeren spørger om produkter, gavekorter, online kurser eller digitale ydelser der kan købes. Returnerer op til 5 produkter med pris, beskrivelse og billede.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Semantisk søgeforespørgsel baseret på hvad brugeren leder efter. Eksempel: 'gavekort zoneterapi', 'online kursus zoneterapeut', 'chi gong begynder'"
      },
      "category": {
        "type": "string",
        "enum": ["gavekorter", "kurser", "digitale-produkter", "abonnementer"],
        "description": "Valgfri kategoribegrænsning"
      },
      "limit": {
        "type": "integer",
        "default": 3,
        "description": "Antal resultater (1-5)"
      }
    },
    "required": ["query"]
  }
}
```

### Tool 2: `shop_add_to_cart`

```json
{
  "name": "shop_add_to_cart",
  "description": "Læg et produkt i brugerens kurv. Kald KUN dette tool efter brugeren eksplicit har bekræftet at de vil tilføje produktet. Accepterede svar: 'ja', 'ja tak', 'tilføj', 'det vil jeg gerne', 'gør det'. Kald IKKE ved tøven, spørgsmål eller usikkerhed.",
  "input_schema": {
    "type": "object",
    "properties": {
      "product_id": {
        "type": "string",
        "description": "ID fra shop_search resultatet"
      },
      "add_to_cart_token": {
        "type": "string",
        "description": "add_to_cart_token fra shop_search resultatet"
      },
      "session_id": {
        "type": "string",
        "description": "Brugerens session_id fra chat-initialisering"
      },
      "quantity": {
        "type": "integer",
        "default": 1
      },
      "options": {
        "type": "object",
        "description": "Valgfrie produktspecifikke felter samlet fra samtalen (fx recipient_name, recipient_email til gavekorter)"
      }
    },
    "required": ["product_id", "add_to_cart_token", "session_id"]
  }
}
```

---

## 4. System Prompt Patch — AI-agenten

Følgende sektion tilføjes til AI-agentens eksisterende system-prompt **efter** den eksisterende RAG-instruktion:

```
## Webshop-adfærd

Du har adgang til Sanne Andersens webshop via to værktøjer: shop_search og shop_add_to_cart.

**Hvornår du søger i shoppen:**
- Når brugeren spørger om priser på gavekorter, online kurser eller digitale produkter
- Når brugeren vil give en gave til nogen
- Når brugeren spørger om at købe adgang til kursusmateriale
- Når konteksten tilsiger at et produkt er relevant (fx "kan man købe et gavekort?")

**Hvordan du præsenterer produkter:**
- Brug altid shop_search og returner resultater — kald aldrig priser fra hukommelsen
- Præsenter maksimalt 3 produkter ad gangen
- Dine produktsvar returneres som struktureret JSON med type "product_card" — UI'et renderer dem automatisk som kort
- Beskriv kort hvorfor netop dette produkt matcher brugerens behov

**Kurv-adfærd — KRITISK:**
- Tilføj ALDRIG til kurven uden eksplicit bekræftelse fra brugeren
- Efter at brugeren bekræfter, kald shop_add_to_cart og vis kurv-bekræftelse med checkout-link
- Hvis add_to_cart_token er udløbet: søg igen automatisk og forsøg på ny
- Spørg om gavekort-info (modtager-navn og email) FØR du kalder add_to_cart hvis delivery_type er "digital"

**Tone:**
- Præsenter produkter naturligt i samtalekonteksten — ikke som en reklameliste
- Fx: "Zoneterapi-gavekort er faktisk perfekt til det — det koster 700 kr og sendes digitalt direkte til Mette. Vil du have lagt det i kurven?"
```

---

## 5. Chat UI — Mini Product Card Spec

Når AI-agentens svar indeholder tool-resultater fra `shop_search`, skal Chat UI-laget **intercepte og rendere** dem som product cards — ikke blot vise rå JSON.

### 5.1 Response-format fra agenten

Agenten returnerer en besked med `content`-array der kan indeholde blandet tekst og product-card blokke:

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Her er det gavekort der passer perfekt — det sendes digitalt direkte til modtageren:"
    },
    {
      "type": "product_card",
      "product": {
        "id": "prod_gk_zoneterapi_60",
        "name": "Gavekort — Zoneterapi 60 min",
        "price_display": "700 kr",
        "short_description": "Digitalt gavekort til én zoneterapi-behandling. Sendes til modtagerens email.",
        "image_url": "https://sanneandersen.dk/shop/img/gk-zoneterapi.webp",
        "image_alt": "Gavekort til zoneterapi",
        "url": "https://sanneandersen.dk/shop/gavekort-zoneterapi-60",
        "delivery_type": "digital",
        "availability": "in_stock",
        "add_to_cart_token": "act_abc123xyz"
      }
    },
    {
      "type": "text",
      "text": "Vil du have lagt det i kurven? Så har jeg brug for modtagerens navn og email."
    }
  ]
}
```

> **Implementation note:** Agentens tool-svar (type `tool_result`) mappes til `product_card`-blokke af chat-middleware-laget før det sendes til frontend. Agenten returnerer ikke selv `product_card`-typen — det er chat UI-lagets ansvar at transformere `shop_search` tool-resultater til denne struktur.

---

### 5.2 Product Card HTML/CSS — Reference Implementation

Kortet skal passe naturligt ind i chat-boblen og bruge platformens eksisterende designsystem (teal/gold, Inter, dark mode).

```html
<div class="product-card-chat">
  <a class="product-card-img-link" href="{url}" target="_blank">
    <img src="{image_url}" alt="{image_alt}" loading="lazy">
  </a>
  <div class="product-card-body">
    <div class="product-card-meta">
      <span class="product-card-delivery">{delivery_type_label}</span>
      <!-- in_stock | out_of_stock badge -->
      <span class="product-card-stock {availability}">{availability_label}</span>
    </div>
    <div class="product-card-name">{name}</div>
    <div class="product-card-desc">{short_description}</div>
    <div class="product-card-footer">
      <span class="product-card-price">{price_display}</span>
      <button class="product-card-atc" 
              data-product-id="{id}" 
              data-token="{add_to_cart_token}"
              onclick="chatAddToCart(this)">
        Læg i kurv
      </button>
    </div>
  </div>
</div>
```

```css
.product-card-chat {
  display: flex;
  gap: 12px;
  background: rgba(74,155,142,0.07);
  border: 1px solid rgba(74,155,142,0.22);
  border-radius: 12px;
  overflow: hidden;
  max-width: 340px;
  margin: 6px 0;
}
.product-card-chat img {
  width: 96px;
  height: 96px;
  object-fit: cover;
  flex-shrink: 0;
}
.product-card-body {
  padding: 10px 12px 10px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.product-card-name {
  font-size: 13px;
  font-weight: 700;
  color: #f0f7f5;
  line-height: 1.3;
}
.product-card-desc {
  font-size: 11px;
  color: rgba(240,247,245,0.55);
  line-height: 1.5;
}
.product-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}
.product-card-price {
  font-size: 14px;
  font-weight: 800;
  color: #E8C97A;
}
.product-card-atc {
  background: rgba(74,155,142,0.2);
  border: 1px solid rgba(74,155,142,0.4);
  border-radius: 7px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  color: #74C4B7;
  cursor: pointer;
  transition: all 0.15s;
}
.product-card-atc:hover {
  background: rgba(74,155,142,0.35);
  color: #f0f7f5;
}
.product-card-atc.added {
  background: rgba(74,155,142,0.15);
  color: rgba(116,196,183,0.6);
  cursor: default;
}
.product-card-stock.in_stock { color: #74C4B7; font-size: 10px; font-weight: 600; }
.product-card-stock.out_of_stock { color: #e57; font-size: 10px; font-weight: 600; }
```

---

### 5.3 "Læg i kurv"-knappen — direkte fra kortet

Brugeren kan trykke på "Læg i kurv" direkte fra product card'et **uden** at bekræfte i chatten. Dette er en alternativ flow til den AI-medierede kurv-tilføjelse.

```javascript
async function chatAddToCart(btn) {
  const productId = btn.dataset.productId;
  const token = btn.dataset.token;
  const sessionId = getChatSessionId(); // fra chat-initialisering

  btn.disabled = true;
  btn.textContent = '…';

  try {
    const res = await fetch('/api/shop/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        product_id: productId,
        add_to_cart_token: token,
        quantity: 1
      })
    });

    const data = await res.json();

    if (data.success) {
      btn.textContent = '✓ Tilføjet';
      btn.classList.add('added');
      updateCartBadge(data.cart.item_count);
      // Indsæt AI-besked i chatten om at varen er lagt i kurven
      appendChatMessage('ai', `Lagt i kurven! 🛒 Du kan betale her: [Gå til kassen](${data.cart.checkout_url})`);
    } else if (data.error === 'token_expired') {
      btn.textContent = 'Udløbet — søg igen';
      // Trigger en ny shop_search i chat-konteksten
      triggerChatRefresh(productId);
    }
  } catch (e) {
    btn.textContent = 'Fejl — prøv igen';
    btn.disabled = false;
  }
}
```

---

## 6. Sikkerhedskrav til Shop Plugin

### 6.1 AI-agent token

- En dedikeret API-nøgle med **read-only** adgang til produktkataloget og **write**-adgang til kurv via engangstoken
- Nøglen roteres månedligt og gemmes som environment variable på serveren — aldrig eksponeret til frontend
- Rate limit: 60 requests/min pr. session

### 6.2 `add_to_cart_token` (engangstoken)

- Genereres ved hvert `shop_search`-kald — unikt pr. produkt pr. forespørgsel
- Udløber efter **15 minutter** eller ved brug — whichever comes first
- Er en JWT signeret med shop-plugin secret — valideres server-side ved `add_to_cart`
- Payload: `{ product_id, price_snapshot, issued_at, session_id }`
- **Pris-snapshot** i token sikrer at prisen ikke kan manipuleres mellem søgning og kurv-tilføjelse

### 6.3 Session binding

- `session_id` er bundet til visitor browser-fingerprint og ip-subnet
- Kurven er ikke tilgængelig på tværs af sessions uden login
- GDPR: kurv-data slettes automatisk efter 48 timer ved anonym session

### 6.4 CORS

```
Access-Control-Allow-Origin: https://sanneandersen.dk
Access-Control-Allow-Methods: GET, POST
Access-Control-Allow-Headers: Authorization, Content-Type
```

---

## 7. Produkt-datamodel i CMS — Krav til shop-admin

For at AI-guiden kan søge og præsentere produkter korrekt skal CMS shop-admin understøtte følgende felter **udover** standard produktfelter:

| Felt | Type | Formål |
|---|---|---|
| `short_description` | tekst, max 120 tegn | Vises i chat product card |
| `ai_tags` | tags | Semantiske søgenøgleord til RAG — fx "gave", "mor", "stress", "begynder" |
| `ai_searchable` | boolean | Om produktet må fremvises i AI-chat (default: true) |
| `delivery_type` | enum | `digital` \| `physical` \| `booking` |
| `chat_highlight` | boolean | Om AI-guiden aktivt må anbefale produktet i relevante samtaler |
| `card_image_url` | url | Dedikeret 400×300 webp-billede til chat-kort (fallback: primært produktbillede) |

Disse felter mappes til et dedikeret `ai_metadata`-objekt i produktets JSON-repræsentation og bruges ikke i standard shop-flow.

---

## 8. Produkt-typer og leveringstekster

AI-agenten formulerer sit svar forskelligt afhængigt af `delivery_type`. Shop-pluginet skal returnere `delivery_type` konsistent.

| `delivery_type` | AI-formulering | Eksempel |
|---|---|---|
| `digital` | "sendes direkte til [modtager]s email" | Gavekort, kursusadgang |
| `physical` | "leveres til din adresse" | Bøger, produkter |
| `booking` | "booker en tid hos Sanne" | Behandlinger der betales online |

---

## 9. Testscenarier

Følgende flows **skal** fungere i integration test før go-live:

| # | Scenarie | Forventet resultat |
|---|---|---|
| 1 | Bruger spørger: "Kan jeg købe et gavekort?" | AI søger, viser ≤3 product cards, spørger om præference |
| 2 | Bruger siger "Det vil jeg gerne" | AI indsamler modtager-info, kalder add_to_cart, viser checkout-link |
| 3 | Bruger trykker "Læg i kurv" direkte på kort | Produkt tilføjes, chat viser bekræftelse med kurv-link |
| 4 | `add_to_cart_token` er udløbet | AI søger automatisk igen, nyt token, tilføjer |
| 5 | Produkt er udsolgt | AI informerer og foreslår alternativ |
| 6 | Bruger spørger om pris uden købeintention | AI besvarer fra RAG (behandlingspriser) — kalder IKKE shop_search |
| 7 | Bruger starter checkout fra chat | checkout_url åbner med aktiv kurv preudfyldt |

---

## 10. Versionering og changelog

| Version | Dato | Ændring |
|---|---|---|
| 0.1 | 2026-03-10 | Første patch-udkast — intern review |
| — | — | Afventer feedback fra CMS-plugin-forfatter |

---

*Patch-dokument udarbejdet af Christian Broberg · WebHouse ApS*  
*Henvendelser: cb@webhouse.dk · webhouse.dk*
