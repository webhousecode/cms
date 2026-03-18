# F68 — Shop Plugin (E-Commerce)

> Content-first e-commerce as a CMS plugin — Stripe as the payment brain, static product pages with Interactive Islands for cart/checkout, AI-native product content generation.

## Problem

The CMS has no commerce capabilities. Users who want to sell products (physical, digital, subscriptions, courses, gift cards) must integrate a separate e-commerce platform, losing the benefits of AI-native content generation, static-first rendering, and the unified admin experience. There is no way to monetize CMS content directly.

## Solution

A plugin package `@webhouse/cms-plugin-shop` that bolts commerce onto the CMS rather than the other way around. Stripe handles all payment complexity (pricing, tax, checkout sessions, subscriptions, payouts). Product pages are pre-rendered static HTML. Cart, checkout, and gated content access use Interactive Islands (F58) for the minimal JavaScript needed. The existing CMS AI agents generate product descriptions, SEO metadata, and marketing copy — the shop plugin needs no AI of its own.

AI chat integration (from the PATCH spec) adds `shop_search` and `shop_add_to_cart` tools to the RAG agent, enabling conversational commerce with mini product cards rendered inline in the chat UI.

## Technical Design

### 1. Package Structure

```
packages/cms-plugin-shop/
  ├── package.json              # @webhouse/cms-plugin-shop
  ├── tsup.config.ts
  ├── src/
  │   ├── index.ts              # Plugin registration entry point
  │   ├── plugin.ts             # CmsPlugin implementation
  │   ├── collections/
  │   │   ├── products.ts       # Product collection schema
  │   │   ├── categories.ts     # Category collection schema
  │   │   ├── orders.ts         # Order collection schema
  │   │   └── customers.ts      # Customer collection schema
  │   ├── stripe/
  │   │   ├── client.ts         # Stripe SDK wrapper
  │   │   ├── checkout.ts       # Stripe Checkout session creation
  │   │   ├── webhooks.ts       # Stripe webhook handlers
  │   │   ├── subscriptions.ts  # Subscription lifecycle management
  │   │   └── prices.ts         # Price sync (Stripe → CMS)
  │   ├── api/
  │   │   ├── search.ts         # GET /api/shop/search (AI agent endpoint)
  │   │   ├── cart.ts           # POST /api/shop/cart/add
  │   │   ├── session.ts        # POST /api/shop/session
  │   │   ├── checkout.ts       # POST /api/shop/checkout (create Stripe session)
  │   │   └── webhooks.ts       # POST /api/shop/webhooks (Stripe events)
  │   ├── islands/
  │   │   ├── cart-island.ts    # Interactive Island: cart widget
  │   │   ├── checkout-island.ts # Interactive Island: checkout button
  │   │   ├── gated-content.ts  # Interactive Island: gated content access
  │   │   └── product-card.ts   # Interactive Island: add-to-cart on product page
  │   ├── ai/
  │   │   ├── tools.ts          # shop_search + shop_add_to_cart tool definitions
  │   │   └── chat-middleware.ts # Transform tool results → product_card blocks
  │   ├── tokens/
  │   │   └── add-to-cart.ts    # JWT generation/validation for add_to_cart_token
  │   └── types.ts              # All TypeScript interfaces
  └── tests/
      ├── checkout.test.ts
      ├── search.test.ts
      ├── cart.test.ts
      └── token.test.ts
```

### 2. Plugin Registration

```typescript
// packages/cms-plugin-shop/src/plugin.ts
import type { CmsPlugin } from '@webhouse/cms';

export const shopPlugin: CmsPlugin = {
  name: '@webhouse/cms-plugin-shop',
  displayName: 'Shop',
  version: '0.1.0',

  collections: ['products', 'categories', 'orders', 'customers'],

  hooks: {
    'content.afterCreate': async (ctx) => {
      // Sync new product to Stripe if collection === 'products'
    },
    'content.afterUpdate': async (ctx) => {
      // Update Stripe product/price when CMS product changes
    },
    'build.afterRender': async (ctx) => {
      // Inject cart island script into product pages
    },
  },

  routes: [
    { method: 'GET',  path: '/api/shop/search',     handler: searchHandler },
    { method: 'POST', path: '/api/shop/cart/add',    handler: cartAddHandler },
    { method: 'POST', path: '/api/shop/session',     handler: sessionHandler },
    { method: 'POST', path: '/api/shop/checkout',    handler: checkoutHandler },
    { method: 'POST', path: '/api/shop/webhooks',    handler: stripeWebhookHandler },
  ],

  islands: ['cart-island', 'checkout-island', 'gated-content', 'product-card'],
};
```

### 3. Product Collection Schema

```typescript
// packages/cms-plugin-shop/src/collections/products.ts
export const productsCollection = {
  name: 'products',
  label: 'Products',
  fields: {
    title:            { type: 'text', required: true },
    slug:             { type: 'text', required: true, unique: true },
    description:      { type: 'richtext' },
    shortDescription: { type: 'text', maxLength: 120 },  // For chat product cards
    productType:      { type: 'select', options: ['physical', 'digital', 'booking', 'subscription', 'course'] },
    deliveryType:     { type: 'select', options: ['digital', 'physical', 'booking'] },
    category:         { type: 'relation', collection: 'categories' },
    tags:             { type: 'tags' },
    image:            { type: 'media' },
    cardImageUrl:     { type: 'text' },  // 400x300 webp for chat cards
    // Stripe-managed pricing
    stripeProductId:  { type: 'text', readOnly: true },
    stripePriceId:    { type: 'text', readOnly: true },
    price:            { type: 'number' },  // Cents — synced from Stripe
    priceDisplay:     { type: 'text', readOnly: true },  // Formatted: "700 kr"
    currency:         { type: 'text', default: 'DKK' },
    // Availability
    availability:     { type: 'select', options: ['in_stock', 'out_of_stock', 'on_demand'], default: 'in_stock' },
    // AI metadata
    aiTags:           { type: 'tags' },  // Semantic search keywords for RAG
    aiSearchable:     { type: 'boolean', default: true },
    chatHighlight:    { type: 'boolean', default: false },  // AI may proactively recommend
    // Gated content (for courses/subscriptions)
    gatedContentIds:  { type: 'tags' },  // Document slugs that require purchase
    // Digital delivery
    digitalAssetUrl:  { type: 'text' },  // Signed URL generated after purchase
  },
};
```

### 4. AI Agent Tool Definitions

```typescript
// packages/cms-plugin-shop/src/ai/tools.ts
export const shopSearchTool = {
  name: 'shop_search',
  description: 'Search the product catalog. Use when users ask about products, prices, gift cards, courses, or anything purchasable.',
  input_schema: {
    type: 'object',
    properties: {
      query:    { type: 'string', description: 'Semantic search query' },
      category: { type: 'string', description: 'Optional category filter' },
      limit:    { type: 'integer', default: 3, description: 'Max results (1-5)' },
    },
    required: ['query'],
  },
};

export const shopAddToCartTool = {
  name: 'shop_add_to_cart',
  description: 'Add a product to cart. ONLY call after explicit user confirmation.',
  input_schema: {
    type: 'object',
    properties: {
      product_id:        { type: 'string' },
      add_to_cart_token: { type: 'string', description: '15-min JWT from search result' },
      session_id:        { type: 'string' },
      quantity:           { type: 'integer', default: 1 },
      options:            { type: 'object', description: 'Product-specific options (e.g. recipient_name for gift cards)' },
    },
    required: ['product_id', 'add_to_cart_token', 'session_id'],
  },
};
```

### 5. add_to_cart_token (JWT)

```typescript
// packages/cms-plugin-shop/src/tokens/add-to-cart.ts
import { SignJWT, jwtVerify } from 'jose';

interface CartTokenPayload {
  product_id: string;
  price_snapshot: number;  // Price in cents at time of search
  session_id: string;
  issued_at: number;
}

// Token lifetime: 15 minutes
const TOKEN_TTL = 15 * 60;

export async function createAddToCartToken(
  payload: CartTokenPayload,
  secret: string
): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${TOKEN_TTL}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyAddToCartToken(
  token: string,
  secret: string
): Promise<CartTokenPayload> {
  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(secret)
  );
  return payload as unknown as CartTokenPayload;
}
```

### 6. Session Binding

- `POST /api/shop/session` creates a session bound to visitor fingerprint + IP subnet
- Session stored server-side (SQLite or CMS collection) with 48h TTL for anonymous visitors
- GDPR: cart data auto-deleted after 48h for anonymous sessions
- Authenticated users get persistent carts tied to their user ID

### 7. Stripe Checkout Flow

```
User clicks "Buy" on product page or chat product card
  → POST /api/shop/checkout { session_id, items[] }
  → Server creates Stripe Checkout Session with:
      - line_items from cart
      - success_url: /shop/thank-you?session={CHECKOUT_SESSION_ID}
      - cancel_url: /shop/cart
      - metadata: { cms_order_id, session_id }
  → Redirect to Stripe Checkout (hosted page — no custom checkout form)
  → Stripe webhook: checkout.session.completed
  → Server creates order in 'orders' collection
  → For digital: generate signed download URL
  → For gated content: grant access via user permissions
  → For subscriptions: track via Stripe subscription webhooks
```

### 8. Chat UI — Mini Product Cards

The chat middleware transforms `shop_search` tool results into `product_card` content blocks:

```typescript
// packages/cms-plugin-shop/src/ai/chat-middleware.ts
interface ProductCardBlock {
  type: 'product_card';
  product: {
    id: string;
    name: string;
    price_display: string;
    short_description: string;
    image_url: string;
    image_alt: string;
    url: string;
    delivery_type: 'digital' | 'physical' | 'booking';
    availability: 'in_stock' | 'out_of_stock' | 'on_demand';
    add_to_cart_token: string;
  };
}
```

Product cards render inline in chat bubbles with an image thumbnail, price, description, and a "Add to cart" button. The button calls `POST /api/shop/cart/add` directly from the client with the embedded `add_to_cart_token`.

### 9. CORS Configuration

```
Access-Control-Allow-Origin: {configured site origin}
Access-Control-Allow-Methods: GET, POST
Access-Control-Allow-Headers: Authorization, Content-Type
```

AI agent token: dedicated API key with read-only product access + write-only cart access via one-time tokens. Rate limit: 60 req/min per session.

### 10. cms.config.ts Integration

```typescript
// In consumer's cms.config.ts
import { shopPlugin } from '@webhouse/cms-plugin-shop';

export default defineConfig({
  plugins: [
    shopPlugin({
      stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY!,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
        currency: 'DKK',
      },
      checkout: {
        successUrl: '/shop/thank-you',
        cancelUrl: '/shop/cart',
      },
      ai: {
        enabled: true,         // Register shop_search + shop_add_to_cart tools
        agentToken: process.env.SHOP_AI_AGENT_TOKEN!,
        chatHighlightEnabled: true,
      },
    }),
  ],
});
```

## Implementation Steps

### Phase 1 — Product Catalog + Stripe Checkout (days 1-4)
1. Scaffold `packages/cms-plugin-shop` with package.json, tsup.config.ts, tsconfig.json
2. Implement plugin registration (`CmsPlugin` interface from F46)
3. Define collections: products, categories, orders, customers
4. Implement Stripe SDK wrapper and price sync
5. Build `POST /api/shop/checkout` — create Stripe Checkout Session
6. Build `POST /api/shop/webhooks` — handle checkout.session.completed, create order
7. Build Interactive Islands: product-card (add-to-cart button), cart-island (cart widget)
8. Static product page rendering with island hydration

### Phase 2 — Digital Delivery + Gated Content (days 5-7)
9. Implement signed download URL generation for digital products after purchase
10. Build gated-content Interactive Island — check purchase status, show/hide content
11. Integrate with user permissions system for content gating
12. Email delivery for digital products (gift cards, course access links)

### Phase 3 — Subscriptions (days 8-10)
13. Implement Stripe subscription lifecycle (create, update, cancel, renew)
14. Handle subscription webhooks: invoice.paid, customer.subscription.updated/deleted
15. Recurring access management for gated content tied to active subscriptions
16. Subscription status display in admin UI

### Phase 4 — AI Chat Integration (days 11-13)
17. Implement `GET /api/shop/search` endpoint with semantic product search
18. Implement `POST /api/shop/cart/add` with add_to_cart_token JWT validation
19. Implement `POST /api/shop/session` for visitor session binding
20. Register `shop_search` and `shop_add_to_cart` as Claude tools in the AI agent
21. Build chat middleware to transform tool results into `product_card` blocks
22. Build mini product card CSS/HTML for chat UI rendering
23. End-to-end testing: search → display card → confirm → add to cart → checkout

## Dependencies

- **F46 — Plugin System** — required for `cms.registerPlugin()` API, hooks, route registration
- **F58 — Interactive Islands** — required for cart, checkout, and gated content client-side interactivity
- **Stripe account** — payment processing, no alternative provider in v1

## Effort Estimate

**XL** — 12-15 days

- Phase 1 (catalog + checkout): 4 days
- Phase 2 (digital + gated): 3 days
- Phase 3 (subscriptions): 3 days
- Phase 4 (AI chat integration): 3 days
- Buffer for Stripe edge cases and testing: 1-2 days
