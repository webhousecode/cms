# F136 — Shop Module (E-Commerce Platform)

> Content-first e-commerce built as CMS document collections — Stripe for payments, GLS/DAO for shipping, AI-native product creation, multi-locale, headless storefront.

## Problem

The CMS has no commerce capabilities today. Users who want to sell products — physical goods, digital downloads, courses, subscriptions, gift cards — must integrate a separate e-commerce platform (Shopify, WooCommerce), losing the benefits of AI-native content generation, static-first rendering, unified admin experience, and the document collection model that makes every other CMS feature flexible and schema-driven.

The existing F68 (Shop Plugin) is too limited: hardcoded Stripe Checkout only, no returns, no shipping integrations, no AI product creation, no discount/rabat system, no bulk import. It's a plugin bolt-on, not a first-class CMS module.

## Solution

A core CMS module `@webhouse/cms-shop` that treats **products, orders, customers, discounts, and returns as document collections** — exactly like all other CMS content. This means:

- **Generisk UI** — editors see the same familiar document editor, list view, and field types
- **Skema-fleksibilitet** — hver shop kan tilføje felter der passer deres behov (størrelser, farver, materialer, etc.)
- **Multi-locale** — produkter, beskrivelser, priser og shipping info per sprog
- **Headless storefront** — produkter renderes som statiske HTML sider med Interactive Islands for kurv/checkout
- **Stripe** som payment brain (Checkout + Payment Elements + Apple Pay/Google Pay)
- **GLS/DAO** integration for scandinaviske forsendelser
- **AI product creation** — foto → produkt (enkeltvis eller bulk op til 500 billeder + CSV/Excel)

```
┌─────────────────────────────────────────────────────────┐
│  CMS Admin (same UI as all collections)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Products │ │ Orders   │ │Customers │ │Discounts │   │
│  │ (docs)   │ │ (docs)   │ │ (docs)   │ │ (docs)   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐                              │
│  │ Returns  │ │Shipping  │                              │
│  │ (docs)   │ │ rates    │                              │
│  └──────────┘ └──────────┘                              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Build Pipeline → Static HTML + Interactive Islands     │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │Product pages│ │Category pages│ │Cart/Checkout UI  │  │
│  │(static)     │ │(static)      │ │(island + Stripe) │  │
│  └─────────────┘ └──────────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Technical Design

### 1. Package Structure

```
packages/cms-shop/
├── package.json                    # @webhouse/cms-shop
├── tsup.config.ts
├── src/
│   ├── index.ts                    # Module entry point
│   ├── module.ts                   # CmsModule implementation
│   ├── collections/
│   │   ├── products.ts             # Product collection schema (extensible)
│   │   ├── categories.ts           # Category collection schema
│   │   ├── orders.ts               # Order collection schema
│   │   ├── customers.ts            # Customer collection schema
│   │   ├── discounts.ts            # Discount/rabat rules
│   │   ├── returns.ts              # Return/refund tracking
│   │   └── shipping-rates.ts       # GLS/DAO shipping rate config
│   ├── stripe/
│   │   ├── client.ts               # Stripe SDK wrapper
│   │   ├── checkout.ts             # Stripe Checkout + Payment Elements
│   │   ├── webhooks.ts             # Stripe webhook handlers
│   │   ├── apple-google-pay.ts     # Apple Pay / Google Pay setup
│   │   └── prices.ts               # Price sync (Stripe → CMS)
│   ├── shipping/
│   │   ├── gls.ts                  # GLS API integration (DK/SE/NO)
│   │   ├── dao.ts                  # DAO API integration (DK)
│   │   ├── postnord.ts             # PostNord API (SE/NO/DK)
│   │   ├── bring.ts                # Bring API (NO)
│   │   ├── rates.ts                # Rate calculation engine
│   │   ├── labels.ts               # Label generation
│   │   └── tracking.ts             # Track & Trace integration
│   ├── returns/
│   │   ├── portal.ts               # Self-service return portal
│   │   ├── labels.ts               # Return label generation
│   │   └── refunds.ts              # Refund processing via Stripe
│   ├── discounts/
│   │   ├── engine.ts               # Discount rule evaluation
│   │   ├── codes.ts                # Promo code management
│   │   ├── bundles.ts              # "Buy X get Y" / bundle discounts
│   │   └── tiered.ts               # Tiered pricing (quantity breaks)
│   ├── ai/
│   │   ├── product-creator.ts      # Photo → product (single + bulk)
│   │   ├── vision.ts               # Image analysis for product data
│   │   ├── bulk-import.ts          # CSV/Excel + 500 image batch
│   │   └── recommendations.ts      # "Andre købte også" engine
│   ├── api/
│   │   ├── cart.ts                 # Cart management API
│   │   ├── checkout.ts             # Checkout session creation
│   │   ├── webhooks.ts             # Stripe + shipping webhooks
│   │   ├── returns.ts              # Return portal API
│   │   ├── tracking.ts             # Track & Trace API
│   │   └── recommendations.ts      # "Andre købte også" API
│   ├── islands/
│   │   ├── cart-island.ts          # Cart widget (floating + page)
│   │   ├── checkout-island.ts      # Checkout form + Stripe Elements
│   │   ├── product-card.ts         # Product card with add-to-cart
│   │   ├── return-portal.ts        # Self-service return UI
│   │   └── recommendations.ts      # "Andre købte også" carousel
│   ├── storefront/
│   │   ├── renderers/              # Static HTML renderers
│   │   │   ├── product-page.ts     # Full product page
│   │   │   ├── category-page.ts    # Category listing
│   │   │   └── cart-page.ts        # Cart page (static shell + island)
│   │   ├── schema.ts               # JSON-LD / Schema markup
│   │   └── sitemap.ts              # Auto-updated sitemap
│   ├── search/
│   │   ├── engine.ts               # NLP product search
│   │   └── filters.ts              # Faceted search (price, category, tags)
│   └── types.ts                    # All TypeScript interfaces
└── tests/
    ├── checkout.test.ts
    ├── shipping.test.ts
    ├── discounts.test.ts
    ├── returns.test.ts
    └── ai-product-creator.test.ts
```

### 2. Module Registration

```typescript
// packages/cms-shop/src/module.ts
import type { CmsModule } from '@webhouse/cms';

export const shopModule: CmsModule = {
  name: '@webhouse/cms-shop',
  displayName: 'Shop',
  version: '0.1.0',

  // Collections — editors see these in the main nav
  collections: [
    'products',
    'categories',
    'orders',
    'customers',
    'discounts',
    'returns',
    'shipping-rates',
  ],

  hooks: {
    'content.afterCreate': async (ctx) => {
      if (ctx.collection === 'products') {
        await syncProductToStripe(ctx);
      }
    },
    'content.afterUpdate': async (ctx) => {
      if (ctx.collection === 'products') {
        await updateProductInStripe(ctx);
      }
    },
    'build.beforeRender': async (ctx) => {
      // Inject shop-specific build steps
      await generateShopSitemap(ctx);
      await generateShopSchemaMarkup(ctx);
    },
    'build.afterRender': async (ctx) => {
      // Inject cart island script into product/category pages
      await injectCartIsland(ctx);
    },
  },

  routes: [
    { method: 'GET',    path: '/api/shop/cart',        handler: cartGetHandler },
    { method: 'POST',   path: '/api/shop/cart/add',    handler: cartAddHandler },
    { method: 'POST',   path: '/api/shop/cart/remove', handler: cartRemoveHandler },
    { method: 'POST',   path: '/api/shop/checkout',    handler: checkoutHandler },
    { method: 'POST',   path: '/api/shop/webhooks',    handler: stripeWebhookHandler },
    { method: 'GET',    path: '/api/shop/search',      handler: searchHandler },
    { method: 'POST',   path: '/api/shop/returns',     handler: returnCreateHandler },
    { method: 'GET',    path: '/api/shop/tracking/:id', handler: trackingHandler },
    { method: 'GET',    path: '/api/shop/recommendations/:productId', handler: recommendationsHandler },
  ],

  islands: [
    'cart-island',
    'checkout-island',
    'product-card',
    'return-portal',
    'recommendations',
  ],

  admin: {
    // Main menu group — same as other CMS sections
    menuGroup: {
      label: 'Shop',
      icon: 'shopping-bag',
      order: 4,  // After Content, Media, Pages
    },
  },
};
```

### 3. Product Collection Schema

Produkter er **document collections** — præcis som alt andet indhold i CMS'et. Det betyder:

- Samme redigeringsoplevelse (richtext editor, media picker, relation fields)
- Samme list view med filtering, sorting, bulk actions
- Samme i18n support (F48) — felter kan oversættes per locale
- Samme AI integration — generate, rewrite, proofread virker på produktfelter
- Samme versioning og revision history

```typescript
// packages/cms-shop/src/collections/products.ts
export const productsCollection = {
  name: 'products',
  label: 'Products',
  icon: 'package',

  // Multi-locale (F48)
  locales: true,

  // Fields — editors can add more via cms.config.ts
  fields: {
    // Core identity
    title:            { type: 'text', required: true, locale: true },
    slug:             { type: 'text', required: true, unique: true },
    description:      { type: 'richtext', locale: true },
    shortDescription: { type: 'text', maxLength: 160, locale: true },  // SEO meta

    // Product type
    productType:      {
      type: 'select',
      options: ['physical', 'digital', 'subscription', 'course', 'giftcard', 'booking'],
      default: 'physical',
    },
    deliveryType:     {
      type: 'select',
      options: ['shipping', 'digital-download', 'pickup', 'booking'],
    },

    // Categorization
    category:         { type: 'relation', collection: 'categories', multiple: true },
    tags:             { type: 'tags' },
    brand:            { type: 'text' },
    sku:              { type: 'text', unique: true },

    // Media
    images:           { type: 'media', multiple: true },
    cardImageUrl:     { type: 'text' },  // 400x300 webp for cards/chat
    videoUrl:         { type: 'text' },  // Product video

    // Pricing (stored in cents, synced from Stripe)
    stripeProductId:  { type: 'text', readOnly: true },
    stripePriceId:    { type: 'text', readOnly: true },
    price:            { type: 'number' },  // Cents
    compareAtPrice:   { type: 'number' },  // Cents — for "was" pricing
    priceDisplay:     { type: 'text', readOnly: true },  // "700 kr"
    currency:         { type: 'text', default: 'DKK' },
    taxRate:          { type: 'number', default: 25 },  // Danish VAT

    // Inventory
    availability:     {
      type: 'select',
      options: ['in_stock', 'low_stock', 'out_of_stock', 'on_demand', 'preorder'],
      default: 'in_stock',
    },
    stockQuantity:    { type: 'number', default: 0 },
    lowStockThreshold:{ type: 'number', default: 5 },

    // Variants (sizes, colors, etc.)
    variants:         {
      type: 'array',
      fields: {
        sku:          { type: 'text' },
        options:      { type: 'object' },  // { size: "M", color: "Red" }
        price:        { type: 'number' },  // Override base price
        stockQuantity:{ type: 'number' },
        stripePriceId:{ type: 'text' },
      },
    },

    // Shipping
    weight:           { type: 'number' },  // grams
    dimensions:       {
      type: 'object',
      fields: {
        length: { type: 'number' },  // cm
        width:  { type: 'number' },
        height: { type: 'number' },
      },
    },
    shippingClass:    { type: 'text' },  // Maps to GLS/DAO shipping classes

    // Digital delivery
    digitalAssetUrl:  { type: 'text' },  // Signed URL generated after purchase
    downloadLimit:    { type: 'number', default: 3 },  // Max downloads

    // SEO
    seoTitle:         { type: 'text', maxLength: 60, locale: true },
    seoDescription:   { type: 'text', maxLength: 160, locale: true },
    keywords:         { type: 'tags', locale: true },

    // AI metadata
    aiTags:           { type: 'tags' },  // Semantic search keywords
    aiSearchable:     { type: 'boolean', default: true },

    // Gated content (for courses/subscriptions)
    gatedContentIds:  { type: 'tags' },  // Document slugs requiring purchase

    // Recommendations
    relatedProducts:  { type: 'relation', collection: 'products', multiple: true },
    crossSellIds:     { type: 'tags' },  // "Andre købte også" — auto-populated by AI

    // Multi-locale pricing
    localePricing:    {
      type: 'object',
      locale: true,
      fields: {
        price:        { type: 'number' },
        currency:     { type: 'text' },
      },
    },
  },

  // Default sort
  defaultSort: { field: 'title', direction: 'asc' },

  // AI can create products
  aiCreate: true,
};
```

### 4. Stripe Integration

```typescript
// packages/cms-shop/src/stripe/client.ts
import Stripe from 'stripe';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
  currency: string;  // DKK, SEK, NOK, EUR
  applePayEnabled: boolean;
  googlePayEnabled: boolean;
}

export class StripeService {
  private client: Stripe;

  constructor(config: StripeConfig) {
    this.client = new Stripe(config.secretKey, { apiVersion: '2024-06-20' });
  }

  async createProduct(product: ProductData): Promise<Stripe.Product> {
    return this.client.products.create({
      name: product.title,
      description: product.shortDescription,
      images: product.images?.slice(0, 10),
      metadata: {
        cms_product_id: product.id,
        cms_slug: product.slug,
        product_type: product.productType,
      },
    });
  }

  async createPrice(productId: string, amount: number, currency: string): Promise<Stripe.Price> {
    return this.client.prices.create({
      product: productId,
      unit_amount: amount,  // cents
      currency: currency.toLowerCase(),
    });
  }

  async createCheckoutSession(params: CheckoutParams): Promise<string> {
    const session = await this.client.checkout.sessions.create({
      mode: 'payment',
      line_items: params.items.map(item => ({
        price: item.stripePriceId,
        quantity: item.quantity,
      })),
      payment_method_types: [
        'card',
        ...(params.applePay ? ['apple_pay'] : []),
        ...(params.googlePay ? ['google_pay'] : []),
        // MobilePay via Stripe if enabled
      ],
      shipping_address_collection: params.needsShipping ? {
        allowed_countries: ['DK', 'SE', 'NO', 'FI', 'DE'],
      } : undefined,
      shipping_options: params.shippingOptions?.map(opt => ({
        shipping_rate_data: {
          display_name: opt.name,
          type: 'fixed_amount',
          fixed_amount: { amount: opt.priceCents, currency: params.currency },
          delivery_estimate: opt.deliveryEstimate,
        },
      })),
      discounts: params.discountCode ? [{ code: params.discountCode }] : undefined,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        cms_order_id: params.orderId,
        cms_session_id: params.sessionId,
      },
      // Enable guest checkout
      customer_creation: 'if_required',
      // Auto-fill from billing address
      billing_address_collection: 'required',
    });

    return session.url!;
  }

  async createPaymentIntent(params: PaymentIntentParams): Promise<Stripe.PaymentIntent> {
    return this.client.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency.toLowerCase(),
      payment_method_types: ['card', 'apple_pay', 'google_pay'],
      metadata: { cms_order_id: params.orderId },
    });
  }
}
```

### 5. Shipping Integration (GLS / DAO / PostNord)

```typescript
// packages/cms-shop/src/shipping/gls.ts
export interface GLSConfig {
  apiKey: string;
  accountId: string;
  country: 'DK' | 'SE' | 'NO';
}

export class GLSService {
  async getRates(address: Address, packages: PackageInfo[]): Promise<ShippingRate[]> {
    // Call GLS API → return available services
  }

  async createLabel(orderId: string, address: Address, pkg: PackageInfo): Promise<ShippingLabel> {
    // Create GLS shipment → return label PDF + tracking number
  }

  async trackPackage(trackingNumber: string): Promise<TrackingStatus> {
    // Poll GLS tracking API
  }

  async createReturnLabel(address: Address): Promise<ReturnLabel> {
    // Create GLS return shipment
  }
}

// packages/cms-shop/src/shipping/dao.ts
export class DAOService {
  // DAO (Danmark) — pakkeshop, erhverv, privat
  async getRates(address: Address): Promise<ShippingRate[]> {
    // DAO API call
  }
  async createLabel(orderId: string, address: Address): Promise<ShippingLabel> {
    // DAO label generation
  }
  async trackPackage(trackingNumber: string): Promise<TrackingStatus> {
    // DAO tracking
  }
}

// packages/cms-shop/src/shipping/rates.ts
export interface ShippingCalculator {
  calculateRates(params: {
    destination: Address;
    items: CartItem[];
    totalWeight: number;  // grams
    shippingClass?: string;
  }): Promise<CalculatedRate[]>;
}

export class ShippingRateEngine implements ShippingCalculator {
  private providers: Map<string, ShippingProvider>;  // 'gls', 'dao', 'postnord'

  async calculateRates(params: {
    destination: Address;
    items: CartItem[];
    totalWeight: number;
  }): Promise<CalculatedRate[]> {
    const rates: CalculatedRate[] = [];

    // Query all configured providers in parallel
    const results = await Promise.allSettled(
      Array.from(this.providers.values()).map(p => p.getRates(params))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        rates.push(...result.value);
      }
    }

    // Sort by price, then delivery time
    return rates.sort((a, b) => a.priceCents - b.priceCents);
  }
}
```

### 6. Discount / Rabat Engine

```typescript
// packages/cms-shop/src/discounts/engine.ts
export interface DiscountRule {
  id: string;
  type: 'percentage' | 'fixed' | 'free_shipping' | 'buy_x_get_y' | 'bundle';
  code?: string;  // Promo code (optional — can be auto-applied)
  conditions: {
    minSubtotal?: number;  // Cents
    minQuantity?: number;
    productIds?: string[];
    categoryIds?: string[];
    customerGroups?: string[];
    firstOrderOnly?: boolean;
    validFrom?: string;
    validUntil?: string;
    usageLimit?: number;
  };
  value: {
    percentage?: number;  // 0-100
    fixedAmount?: number;  // Cents
    freeShipping?: boolean;
    buyQuantity?: number;
    getQuantity?: number;
    getProductIds?: string[];
  };
  appliesTo: 'subtotal' | 'shipping' | 'specific_products';
  stackable: boolean;  // Can combine with other discounts
  priority: number;  // Lower = applied first
}

export class DiscountEngine {
  async applyDiscounts(cart: Cart, rules: DiscountRule[]): Promise<DiscountResult> {
    const applicable = rules.filter(rule => this.matchesConditions(cart, rule));
    const sorted = applicable.sort((a, b) => a.priority - b.priority);

    let discountTotal = 0;
    const applied: AppliedDiscount[] = [];

    for (const rule of sorted) {
      if (!rule.stackable && applied.length > 0) continue;

      const savings = this.calculateSavings(cart, rule);
      if (savings > 0) {
        discountTotal += savings;
        applied.push({ ruleId: rule.id, code: rule.code, savings });
      }
    }

    return {
      cartTotal: cart.subtotal - discountTotal,
      discountTotal,
      applied,
    };
  }
}
```

### 7. Return System

```typescript
// packages/cms-shop/src/returns/portal.ts
export interface ReturnRequest {
  orderId: string;
  items: {
    productId: string;
    quantity: number;
    reason: 'wrong_item' | 'defective' | 'not_as_described' | 'changed_mind' | 'other';
    comment?: string;
  }[];
  refundMethod: 'original' | 'store_credit';
}

export class ReturnService {
  async createReturn(request: ReturnRequest): Promise<ReturnResult> {
    // 1. Validate return window (default: 14 days from delivery)
    // 2. Create return record in 'returns' collection
    // 3. Generate return label (GLS/DAO)
    // 4. Send email to customer with return instructions
    // 5. Update order status
  }

  async processReturn(returnId: string, action: 'approve' | 'reject'): Promise<void> {
    if (action === 'approve') {
      // Generate refund via Stripe
      // Update inventory
      // Send confirmation email
    }
  }
}
```

### 8. AI Product Creation

```typescript
// packages/cms-shop/src/ai/product-creator.ts
export interface ProductFromImage {
  image: Buffer | string;  // Photo of product
  locale?: string;
  generateDescription?: boolean;
  generateSEO?: boolean;
  detectVariants?: boolean;
}

export class AIProductCreator {
  async createFromImage(params: ProductFromImage): Promise<Partial<Product>> {
    // 1. Analyze image with vision model (GPT-4o / Gemini / Claude)
    // 2. Extract: name, description, category, tags, color, material
    // 3. Generate: SEO title, meta description, short description
    // 4. Suggest: price range (based on category + brand detection)
    // 5. Return product draft for editor review
  }

  async bulkCreate(params: {
    images: Buffer[] | string[];  // Up to 500 images
    csvData?: string;  // Optional CSV with SKU, price, stock
    excelData?: Buffer;  // Optional Excel file
    locale: string;
  }): Promise<BulkProductResult> {
    // 1. Process images in batches (parallel vision calls)
    // 2. Merge with CSV/Excel data if provided
    // 3. Create product documents in CMS
    // 4. Sync to Stripe
    // 5. Return summary: created, failed, warnings
  }
}
```

**AI Product Creation Flow:**

```
Editor uploads photo(s)
  → Vision model analyzes image
    → Detects: product type, color, material, brand, style
    → Generates: title, description (multi-locale), tags, category suggestion
    → Suggests: price range, shipping class
  → Editor reviews and edits (same document editor)
  → Save → auto-sync to Stripe
```

**Bulk Import Flow:**

```
Editor uploads:
  - Up to 500 product images (ZIP or multi-select)
  - Optional: CSV/Excel with SKU, price, stock, category
  → System matches images to CSV rows (by filename or order)
  → AI analyzes each image in parallel batches (10 at a time)
  → Creates product documents
  → Syncs all to Stripe
  → Reports: created X, failed Y, needs review Z
```

### 9. Recommendations Engine ("Andre købte også")

```typescript
// packages/cms-shop/src/ai/recommendations.ts
export class RecommendationEngine {
  async getRecommendations(productId: string, limit: number = 4): Promise<Product[]> {
    // Phase 1 (simple): Co-purchase analysis from order data
    // "Customers who bought X also bought Y"
    const coPurchases = await this.getCoPurchaseData(productId, limit);

    // Phase 2 (AI): Semantic similarity + category matching
    const similar = await this.getSemanticSimilar(productId, limit);

    // Phase 3 (ML): Collaborative filtering (when enough data)
    // Deferred to later

    return mergeAndDeduplicate(coPurchases, similar).slice(0, limit);
  }

  private async getCoPurchaseData(productId: string, limit: number): Promise<Product[]> {
    // Query orders collection:
    // - Find all orders containing this product
    // - Find other products in those orders
    // - Rank by frequency
  }

  private async getSemanticSimilar(productId: string, limit: number): Promise<Product[]> {
    // Use AI to find semantically similar products
    // Based on: category, tags, description, price range
  }
}
```

### 10. Cart & Checkout

```typescript
// packages/cms-shop/src/api/cart.ts
export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  priceCents: number;  // Snapshot at add-time
  add_to_cart_token: string;  // 15-min JWT for price protection
}

export interface Cart {
  sessionId: string;
  items: CartItem[];
  subtotal: number;
  discount?: AppliedDiscount;
  shipping?: CalculatedRate;
  total: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

// Session-based cart (anonymous) → merges with account cart on login
// Stored in SQLite (server-side) with 48h TTL for anonymous
// Persistent for authenticated users
```

### 11. Checkout Flow

```
User clicks "Køb nu" on product page
  → Cart island opens (floating sidebar)
  → User reviews cart, enters shipping address
  → System calculates shipping rates (GLS/DAO/PostNord)
  → User selects shipping method
  → Discount code applied (if any)
  → User clicks "Gå til betaling"
  → POST /api/shop/checkout
    → Server creates Stripe Checkout Session
    → Redirect to Stripe (hosted page)
      → User pays with Card / Apple Pay / Google Pay / MobilePay
    → Stripe redirects to /shop/thank-you?session=xxx
  → Stripe webhook: checkout.session.completed
    → Server creates order in 'orders' collection
    → For digital: generate signed download URL
    → For physical: create shipping label (GLS/DAO)
    → Send order confirmation email
    → Update inventory
```

### 12. Self-Service Return Portal

```
Customer visits /shop/returns
  → Enters order number + email
  → System looks up order
  → Customer selects items to return + reason
  → System generates return label (GLS/DAO)
  → Customer prints label + ships
  → When return received:
    → Admin reviews in CMS
    → Approve → Stripe refund issued
    → Reject → customer notified
```

### 13. Schema Markup & SEO

```typescript
// packages/cms-shop/src/storefront/schema.ts
export function generateProductSchema(product: Product): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.shortDescription,
    image: product.images?.[0],
    sku: product.sku,
    brand: { '@type': 'Brand', name: product.brand },
    offers: {
      '@type': 'Offer',
      price: (product.price / 100).toFixed(2),
      priceCurrency: product.currency,
      availability: product.availability === 'in_stock'
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: product.url,
    },
    aggregateRating: product.reviews?.length > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length,
      reviewCount: product.reviews.length,
    } : undefined,
  };
}
```

### 14. cms.config.ts Integration

```typescript
// In consumer's cms.config.ts
import { shopModule } from '@webhouse/cms-shop';

export default defineConfig({
  modules: [
    shopModule({
      stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY!,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY!,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
        currency: 'DKK',
        applePay: true,
        googlePay: true,
      },
      shipping: {
        providers: ['gls', 'dao'],
        gls: {
          apiKey: process.env.GLS_API_KEY!,
          accountId: process.env.GLS_ACCOUNT_ID!,
          country: 'DK',
        },
        dao: {
          apiKey: process.env.DAO_API_KEY!,
        },
        freeShippingThreshold: 50000,  // 500 DKK in cents
      },
      returns: {
        enabled: true,
        windowDays: 14,
        autoApprove: false,
      },
      discounts: {
        enabled: true,
        maxStackable: 2,
      },
      ai: {
        productCreation: true,
        recommendations: true,
        visionModel: 'openai/gpt-4o',  // For image analysis
      },
      checkout: {
        successUrl: '/shop/tak',
        cancelUrl: '/shop/kurv',
        guestCheckout: true,
        addressAutocomplete: true,
      },
    }),
  ],
});
```

## Impact Analysis

### Files affected
- `packages/cms-shop/` — entirely new module package (all new files)
- `packages/cms/src/module.ts` — may need `CmsModule` interface extended (if not already supporting modules)
- `packages/cms-admin/src/lib/ai-config.ts` — may add `openrouter` provider for AI product creation
- `packages/cms-admin/src/app/api/` — new API routes registered via module system

### Downstream dependents
- `packages/cms-shop/` — new package, 0 dependents
- If `CmsModule` interface is new: all existing modules would need to implement it (currently only F46 plugin system exists)

### Blast radius
- **None to existing code** — standalone module package
- Stripe webhook handling is security-critical (payment data)
- Shipping API keys are sensitive
- Return/refund processing touches Stripe (financial impact)

### Breaking changes
- None — module is opt-in via `cms.config.ts`

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Product collection schema creates valid documents
- [ ] Stripe Checkout session created successfully
- [ ] Stripe webhook handles checkout.session.completed
- [ ] Apple Pay / Google Pay payment methods available
- [ ] GLS shipping rates calculated correctly
- [ ] DAO shipping rates calculated correctly
- [ ] Discount engine applies percentage discount
- [ ] Discount engine applies buy-X-get-Y discount
- [ ] Return request created and label generated
- [ ] AI product creation from single image
- [ ] AI bulk product creation from 50 images + CSV
- [ ] Cart island hydrates and tracks items
- [ ] Checkout flow completes end-to-end (test mode)
- [ ] Schema markup validates on product pages
- [ ] Multi-locale product content renders correctly
- [ ] Recommendation engine returns relevant products

## Implementation Steps

### Phase 1 — Product Catalog + Stripe Checkout (days 1-5) ✅ DONE
1. ✅ Scaffold `packages/cms-shop` with package.json, tsup.config.ts, tsconfig.json — shipped in 0.3.0
2. ⏳ Module registration (`CmsModule` interface) — collections export ready; cms-admin wiring pending
3. ✅ Define collections: products, categories, orders, customers — shipped in 0.3.0
4. ✅ Stripe SDK wrapper and product/price sync — `@webhouse/cms-shop/stripe`
5. ✅ Cart management API — engine + Request/Response handlers in `@webhouse/cms-shop/cart`
6. ✅ `POST /api/shop/checkout` Stripe Checkout Session — `@webhouse/cms-shop/checkout`
7. ✅ `POST /api/shop/webhooks` handler — signature verification + order doc factory in `@webhouse/cms-shop/webhooks`
8. ✅ Interactive Islands: product-card, cart, checkout-status — `@webhouse/cms-shop/islands`
9. ✅ Static product page rendering — `renderProductPage`, `renderProductCard` in `@webhouse/cms-shop/storefront`
10. ✅ Guest checkout (cart works without an account) + DK-first address validation — `validateAddress`, autocomplete extension point

**What's still needed before a real site can transact in Phase 1:**
- cms-admin: register the cms-shop module so product `afterCreate` / `afterUpdate` hooks call `syncProductToStripe`
- Per-site config UI for `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
- Boilerplate / dogfood site that mounts the four `/api/shop/*` route handlers and renders a product page

### Phase 2 — Shipping Integration (days 6-9)
11. Implement GLS API integration (rates, labels, tracking)
12. Implement DAO API integration (rates, labels, tracking)
13. Build shipping rate calculator engine
14. Wire shipping rates into checkout flow
15. Build Track & Trace integration
16. Shipping rate config collection in admin

### Phase 3 — Returns + Discounts (days 10-14)
17. Implement return request creation
18. Build self-service return portal
19. Implement return label generation (GLS/DAO)
20. Build refund processing via Stripe
21. Implement discount rule engine (percentage, fixed, free shipping)
22. Build promo code management
23. Implement "Buy X get Y" and bundle discounts
24. Wire discounts into checkout flow

### Phase 4 — AI Product Creation (days 15-18)
25. Implement vision-based product analysis (single image)
26. Build bulk product creation (up to 500 images + CSV/Excel)
27. Wire AI into product collection (create button → "Create from photo")
28. Implement multi-locale product description generation
29. Build AI tag and category suggestion

### Phase 5 — Recommendations + Polish (days 19-22)
30. Implement co-purchase analysis engine
31. Build "Andre købte også" carousel island
32. Wire recommendations into product pages
33. Implement JSON-LD schema markup for products
34. Auto-generate shop sitemap entries
35. Multi-locale testing across all shop surfaces
36. End-to-end testing: create product → add to cart → checkout → order → return

## Dependencies

- **F46 — Plugin System** — module registration pattern (or `CmsModule` interface)
- **F58 — Interactive Islands** — cart, checkout, return portal, recommendations widgets
- **F48 — Internationalization (i18n)** — multi-locale product content, pricing, shipping info
- **F107 — Chat with Your Site** — expose shop tools (search, add-to-cart) to chat
- **F135 — OpenRouter AI Fallback** — for AI product creation fallback
- **Stripe account** — payment processing
- **GLS/DAO API accounts** — shipping integration

## Effort Estimate

**XL** — 20-25 days

- Phase 1 (catalog + checkout): 5 days
- Phase 2 (shipping): 4 days
- Phase 3 (returns + discounts): 5 days
- Phase 4 (AI product creation): 4 days
- Phase 5 (recommendations + polish): 4 days
- Buffer for Stripe/shipping edge cases and testing: 2-3 days

---

> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-shop/tests/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/shop-{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-shop-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-stripe.ts` (intercept Stripe), `mock-shipping.ts` (intercept GLS/DAO), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.

> **i18n (F48):** This feature produces and manages user-facing content in multiple locales. All product descriptions, shipping info, discount rules, return policies, and UI text MUST respect the site's `defaultLocale` and `locales` settings. Product prices can vary by locale/currency. Use `getLocale()` for runtime locale resolution. See [F48 i18n](F48-i18n.md) for details.
