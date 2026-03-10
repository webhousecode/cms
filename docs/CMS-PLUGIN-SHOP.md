# @webhouse/cms-plugin-shop — E-Commerce Plugin

## Architecture & Development Plan

**Version:** 0.1.0-draft
**Status:** Plugin Architecture Specification
**Package:** `@webhouse/cms-plugin-shop`
**Dependency:** `@webhouse/cms` ^0.1.0
**Payment Provider:** Stripe (primary, extensible)

---

## 1. Plugin Overview

### 1.1 What This Plugin Does

The shop plugin extends `@webhouse/cms` with full e-commerce capabilities — from simple product pages to digital content delivery, subscriptions, and gated course platforms. It follows the CMS engine's static-first philosophy: product pages are pre-rendered HTML, with minimal Interactive Islands for cart, checkout, and gated content access.

### 1.2 Design Principles

- **Stripe is the payment brain** — Stripe handles pricing, tax, checkout, subscriptions, and payouts. The CMS handles content, presentation, and delivery.
- **Static until it can't be** — Product pages, category pages, and landing pages are fully static. Only cart, checkout, and authenticated content access require JavaScript.
- **AI-native commerce** — Product descriptions, SEO, images, and marketing copy are generated and optimized by the CMS AI agents. The shop plugin doesn't need its own AI — it leverages the existing agent layer.
- **Content-first commerce** — Unlike traditional e-commerce platforms that bolt on content, this is a CMS that bolts on commerce. Content (blogs, guides, courses) is the primary value; commerce is the monetization layer.
- **Progressive complexity** — A simple shop with 5 products and a complex subscription platform with gated video courses use the same plugin, just different configurations.

### 1.3 Plugin Scope

```
┌─────────────────────────────────────────────────────────────┐
│                @webhouse/cms-plugin-shop                     │
│                                                              │
│  Phase 1: Physical & Simple Digital Products                 │
│  Phase 2: Digital Content Delivery (e-books, video, files)   │
│  Phase 3: Subscriptions & Memberships                        │
│  Phase 4: Courses & Gated Content Platform                   │
│  Phase 5: Advanced Commerce (bundles, affiliates, analytics) │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architecture

### 2.1 System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Shop Plugin                                │
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐    │
│  │ Product    │  │ Order      │  │ Customer            │    │
│  │ Collections│  │ Management │  │ Management          │    │
│  │            │  │            │  │                     │    │
│  │- Physical  │  │- Creation  │  │- Stripe Customer    │    │
│  │- Digital   │  │- Fulfillment│ │- Purchase history   │    │
│  │- Subscrip. │  │- Refunds   │  │- Access rights      │    │
│  │- Course    │  │- Downloads │  │- Subscription state │    │
│  └─────┬──────┘  └─────┬──────┘  └──────────┬──────────┘    │
│        │               │                     │               │
│  ┌─────▼───────────────▼─────────────────────▼────────────┐  │
│  │                  Stripe Sync Layer                      │  │
│  │                                                         │  │
│  │  Products ←→ Stripe Products     Sessions → Orders      │  │
│  │  Prices ←→ Stripe Prices         Webhooks → State sync  │  │
│  │  Customers ←→ Stripe Customers   Invoices → Receipts    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Interactive Islands (Preact)                │  │
│  │                                                          │  │
│  │  CartIsland │ CheckoutBtn │ VariantPicker │ GateIsland  │  │
│  │  (~3KB)     │ (~1KB)      │ (~2KB)        │ (~2KB)      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Digital Delivery Layer                       │  │
│  │                                                          │  │
│  │  Signed URLs │ Download tokens │ Stream auth │ DRM-lite  │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Stripe as Source of Truth

A critical architectural decision: **Stripe owns pricing, payment state, and subscription lifecycle.** The CMS owns content, presentation, and delivery.

```
CMS Owns:                          Stripe Owns:
├── Product descriptions            ├── Prices and currencies
├── Product images and media        ├── Payment processing
├── SEO and meta data               ├── Tax calculation
├── Page templates and layout       ├── Subscription billing cycles
├── Digital file storage            ├── Invoice generation
├── Course content structure        ├── Refund processing
├── Category taxonomy               ├── Customer payment methods
└── AI-generated content            └── Checkout sessions
```

This separation means:
- If Stripe is down, product pages still load (they're static HTML)
- Prices are always accurate (synced from Stripe, not duplicated)
- PCI compliance is Stripe's responsibility, not ours
- Subscription state is managed by Stripe's battle-tested billing engine

### 2.3 Hook Integration with CMS Core

The plugin registers itself through the CMS extension system:

```
Plugin Registration:

Hooks:
├── content.afterCreate     → Sync new product to Stripe
├── content.afterUpdate     → Update Stripe product/price
├── content.beforeDelete    → Archive Stripe product (never delete)
├── build.beforeRender      → Inject shop page templates
├── build.afterRender       → Generate product sitemaps + structured data
├── ai.afterGenerate        → Auto-categorize products, generate variants
├── media.afterProcess      → Create product image variants (thumbnails, OG)
└── auth.onAuthenticate     → Check subscription/purchase access rights

Collections Registered:
├── products
├── categories
├── orders
├── customers
├── downloads (digital files)
├── subscriptionPlans
├── courses
├── courseLessons
└── courseProgress

Block Types Registered:
├── ProductGridBlock
├── ProductCardBlock
├── ProductHeroBlock
├── CartBlock (interactive island)
├── CheckoutButtonBlock (interactive island)
├── VariantPickerBlock (interactive island)
├── PricingTableBlock
├── SubscriptionCardBlock
├── CourseOutlineBlock
├── LessonVideoBlock (interactive island — gated)
├── DownloadButtonBlock (interactive island — gated)
└── PaywallBlock (interactive island — gated)

API Routes Registered:
├── POST   /api/shop/checkout          → Create Stripe Checkout Session
├── POST   /api/shop/webhook           → Receive Stripe webhook events
├── POST   /api/shop/portal            → Create Stripe Customer Portal session
├── GET    /api/shop/orders             → List orders (authenticated)
├── GET    /api/shop/orders/:id         → Order detail (authenticated)
├── GET    /api/shop/downloads/:token   → Serve digital file (signed URL)
├── GET    /api/shop/access/:resource   → Check content access rights
├── POST   /api/shop/cart               → Server-side cart (optional)
└── GET    /api/shop/products/:id/price → Get current Stripe price (dynamic)
```

---

## 3. Content Model

### 3.1 Products Collection

```
Collection: "products"

Fields:
├── name (text, required)
│   └── ai: { generate: true, tone: "commercial", maxLength: 80 }
├── slug (text, auto-generated from name)
├── description (richtext)
│   └── ai: { generate: true, tone: "persuasive", audience: "buyers" }
├── shortDescription (text, max 160 chars)
│   └── ai: { generate: true, deriveFrom: "description" }
├── productType (enum: physical | digital | subscription | course)
├── status (enum: draft | active | archived)
│
├── pricing (object)
│   ├── price (number, required)
│   ├── compareAtPrice (number, optional — strikethrough "was" price)
│   ├── currency (text, default from site config)
│   ├── stripeProductId (text, auto-synced, readonly)
│   └── stripePriceId (text, auto-synced, readonly)
│
├── images (image[], media pipeline)
│   └── ai: { generate: true, style: "product-photography" }
├── featuredImage (image, first from images[])
│
├── variants (array, optional)
│   ├── name (text — e.g., "Size", "Color")
│   ├── sku (text, unique)
│   ├── price (number, override base price)
│   ├── stock (number, null = unlimited)
│   ├── stripePriceId (text, auto-synced)
│   └── attributes (object — e.g., { size: "XL", color: "Blue" })
│
├── category (relation → categories, multiple)
├── tags (text[])
│   └── ai: { generate: true, forSEO: true }
│
├── seo (object)
│   ├── metaTitle (text)
│   ├── metaDescription (text)
│   ├── ogImage (image)
│   └── ai: { generate: true, optimizeFor: "purchase-intent" }
│
├── digital (object, when productType = digital)
│   ├── files (file[], stored in secure storage)
│   ├── downloadLimit (number, null = unlimited)
│   ├── downloadExpiry (number, hours after purchase)
│   └── previewFile (file, optional free sample)
│
├── subscription (object, when productType = subscription)
│   ├── interval (enum: month | year)
│   ├── intervalCount (number, default 1)
│   ├── trialDays (number, optional)
│   ├── stripeSubscriptionPriceId (text, auto-synced)
│   └── accessRights (text[] — content gate keys)
│
├── course (object, when productType = course)
│   ├── courseId (relation → courses)
│   ├── accessType (enum: lifetime | subscription | rental)
│   ├── rentalDays (number, when accessType = rental)
│   └── certificateTemplate (text, optional)
│
├── relatedProducts (relation → products[], optional)
│   └── ai: { suggest: true, basedOn: "category+tags" }
│
└── metadata (object, extensible key-value for custom data)
```

### 3.2 Categories Collection

```
Collection: "categories"

Fields:
├── name (text, required)
├── slug (text, auto-generated)
├── description (richtext)
│   └── ai: { generate: true }
├── image (image)
├── parent (relation → categories, self-referencing for tree)
├── sortOrder (number)
└── seo (object — same pattern as products)
```

### 3.3 Orders Collection

```
Collection: "orders"

Fields:
├── orderNumber (text, auto-generated, human-readable — e.g., "WH-2026-0042")
├── status (enum: pending | paid | fulfilled | refunded | cancelled)
├── stripeSessionId (text, from Checkout Session)
├── stripePaymentIntentId (text)
├── stripeInvoiceId (text, for subscriptions)
│
├── customer (object)
│   ├── email (text)
│   ├── name (text)
│   ├── stripeCustomerId (text)
│   └── shippingAddress (object, for physical products)
│
├── items (array)
│   ├── productId (relation → products)
│   ├── productName (text, snapshot at time of purchase)
│   ├── variantName (text, optional)
│   ├── sku (text)
│   ├── quantity (number)
│   ├── unitPrice (number)
│   └── total (number)
│
├── subtotal (number)
├── tax (number, from Stripe Tax)
├── total (number)
├── currency (text)
│
├── downloads (array, for digital products)
│   ├── fileId (text)
│   ├── downloadToken (text, unique per purchase)
│   ├── downloadsUsed (number)
│   ├── downloadLimit (number)
│   └── expiresAt (date)
│
├── fulfillment (object, for physical products)
│   ├── status (enum: unfulfilled | shipped | delivered)
│   ├── trackingNumber (text)
│   ├── trackingUrl (text)
│   └── shippedAt (date)
│
├── createdAt (date)
├── paidAt (date)
└── notes (text, internal admin notes)
```

### 3.4 Customers Collection

```
Collection: "customers"

Fields:
├── email (text, unique, required)
├── name (text)
├── stripeCustomerId (text, auto-synced)
│
├── purchases (array, derived from orders)
│   └── productIds, dates, totals
│
├── subscriptions (array, synced from Stripe)
│   ├── stripeSubscriptionId (text)
│   ├── planId (relation → products where type=subscription)
│   ├── status (enum: active | past_due | cancelled | trialing)
│   ├── currentPeriodEnd (date)
│   └── cancelAtPeriodEnd (boolean)
│
├── accessRights (text[], computed from active purchases + subscriptions)
│   // e.g., ["course:react-masterclass", "downloads:premium", "content:members-only"]
│
├── courseProgress (array)
│   ├── courseId (relation → courses)
│   ├── completedLessons (text[])
│   ├── lastAccessedLesson (text)
│   ├── progressPercent (number)
│   └── completedAt (date, null if in progress)
│
├── downloadHistory (array)
│   ├── fileId, downloadedAt, ipAddress
│
├── createdAt (date)
└── lastActiveAt (date)
```

### 3.5 Courses Collection

```
Collection: "courses"

Fields:
├── title (text, required)
│   └── ai: { generate: false } // Courses are manually authored
├── slug (text, auto-generated)
├── description (richtext)
│   └── ai: { generate: true, tone: "educational" }
├── shortDescription (text, max 160 chars)
├── instructor (object)
│   ├── name (text)
│   ├── bio (richtext)
│   ├── avatar (image)
│   └── credentials (text)
├── coverImage (image)
├── promoVideo (text, URL or media pipeline ref)
├── status (enum: draft | published | archived)
├── difficulty (enum: beginner | intermediate | advanced)
├── estimatedDuration (text — e.g., "12 hours")
├── tags (text[])
│
├── modules (array — course sections/chapters)
│   ├── title (text)
│   ├── description (text)
│   ├── sortOrder (number)
│   └── lessons (relation → courseLessons[])
│
├── prerequisites (relation → courses[], optional)
├── relatedCourses (relation → courses[], optional)
│   └── ai: { suggest: true }
│
├── pricing (object)
│   ├── model (enum: one-time | subscription-required | free)
│   ├── productId (relation → products, when model != free)
│   └── freePreviewLessons (number, default 1)
│
├── certificate (object, optional)
│   ├── enabled (boolean)
│   ├── template (text, SVG/PDF template ref)
│   └── requiredCompletionPercent (number, default 100)
│
├── seo (object — same as products)
└── metadata (object, extensible)
```

### 3.6 Course Lessons Collection

```
Collection: "courseLessons"

Fields:
├── title (text, required)
├── slug (text, auto-generated)
├── courseId (relation → courses)
├── moduleIndex (number — which module this belongs to)
├── sortOrder (number — order within module)
├── status (enum: draft | published)
├── isFreePreview (boolean, default false)
│
├── contentType (enum: video | text | quiz | assignment | download)
│
├── video (object, when contentType = video)
│   ├── source (enum: upload | youtube | vimeo | mux | bunny)
│   ├── url (text — signed/gated URL for uploaded, embed URL for external)
│   ├── duration (number, seconds)
│   ├── thumbnailImage (image)
│   ├── transcript (richtext)
│   │   └── ai: { generate: true, fromVideo: true }
│   ├── chapters (array of { time, title })
│   └── captions (file[], VTT format)
│       └── ai: { generate: true, translate: ["da", "de", "es"] }
│
├── text (richtext, when contentType = text)
│   └── body: Block[] (standard CMS blocks — richtext, images, code, etc.)
│
├── quiz (object, when contentType = quiz)
│   ├── questions (array)
│   │   ├── question (text)
│   │   ├── type (enum: multiple-choice | true-false | open)
│   │   ├── options (text[], for multiple-choice)
│   │   ├── correctAnswer (text or number)
│   │   └── explanation (text)
│   │       └── ai: { generate: true }
│   ├── passingScore (number, percentage)
│   └── retryAllowed (boolean)
│
├── downloads (file[], supplementary materials)
│   // PDFs, code files, worksheets, etc.
│
├── estimatedDuration (number, minutes)
└── metadata (object, extensible)
```

---

## 4. Stripe Integration Layer

### 4.1 Sync Engine

```
┌────────────────────────────────────────────────────────┐
│                 Stripe Sync Engine                      │
│                                                         │
│  CMS → Stripe (on content changes):                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Product created  → stripe.products.create()      │  │
│  │ Product updated  → stripe.products.update()      │  │
│  │ Price changed    → stripe.prices.create() (new)  │  │
│  │                    + deactivate old price         │  │
│  │ Product archived → stripe.products.update(active) │  │
│  │ Variant added    → stripe.prices.create()        │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  Stripe → CMS (via webhooks):                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ checkout.session.completed                       │  │
│  │   → Create order                                 │  │
│  │   → Grant access rights (digital/course)         │  │
│  │   → Generate download tokens                     │  │
│  │   → Send confirmation email (via CMS email hook) │  │
│  │                                                   │  │
│  │ invoice.paid (subscriptions)                     │  │
│  │   → Extend subscription period                   │  │
│  │   → Update access rights                         │  │
│  │                                                   │  │
│  │ customer.subscription.updated                    │  │
│  │   → Sync subscription status                     │  │
│  │   → Adjust access rights                         │  │
│  │                                                   │  │
│  │ customer.subscription.deleted                    │  │
│  │   → Revoke subscription access                   │  │
│  │   → Retain course progress (data stays)          │  │
│  │                                                   │  │
│  │ charge.refunded                                  │  │
│  │   → Update order status                          │  │
│  │   → Revoke download tokens                       │  │
│  │   → Revoke content access (configurable)         │  │
│  │                                                   │  │
│  │ product.updated (Stripe Dashboard changes)       │  │
│  │   → Sync price back to CMS                       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  Stripe Price Immutability:                             │
│  Stripe prices cannot be edited — only created new.     │
│  When a CMS user changes a price:                       │
│  1. New Stripe Price is created                         │
│  2. Old Stripe Price is deactivated                     │
│  3. CMS updates stripePriceId reference                 │
│  4. Existing subscribers stay on old price              │
│  5. New purchases use new price                         │
└────────────────────────────────────────────────────────┘
```

### 4.2 Checkout Flow

```
Customer Journey (Static-First):

1. Browse (100% static HTML)
   └── Product pages pre-rendered at build time
       ├── Images optimized, WebP/AVIF
       ├── Structured data (JSON-LD) for Google Shopping
       └── Price embedded in HTML (refreshed on build)

2. Add to Cart (Interactive Island, ~3KB)
   └── CartIsland (Preact component)
       ├── State: localStorage (items, quantities)
       ├── UI: Slide-out drawer
       ├── Variant selection inline
       └── Quantity adjustment

3. Checkout (Server-side → Stripe redirect)
   └── POST /api/shop/checkout
       ├── Receives: { items: [{ priceId, quantity }] }
       ├── Creates: Stripe Checkout Session
       │   ├── line_items from cart
       │   ├── Stripe Tax automatic calculation
       │   ├── Shipping options (physical) or none (digital)
       │   ├── Subscription mode (if subscription items)
       │   ├── customer_email (if known)
       │   └── metadata: { source: "webhouse-cms" }
       └── Returns: { sessionUrl } → redirect to Stripe

4. Payment (Stripe Hosted Checkout)
   └── Stripe handles everything:
       ├── Card, Apple Pay, Google Pay, Klarna, iDEAL, etc.
       ├── 3D Secure / SCA
       ├── Tax calculation and display
       ├── Subscription terms display
       └── Redirect back to success/cancel URL

5. Confirmation (Static page + server enhancement)
   └── /order/success?session_id={CHECKOUT_SESSION_ID}
       ├── Server retrieves session details
       ├── Displays order confirmation
       ├── For digital: shows download links
       ├── For courses: shows "Start Course" button
       └── Email confirmation sent (webhook-triggered)
```

### 4.3 Customer Portal

Stripe's Customer Portal handles all subscription management:

```
POST /api/shop/portal
├── Creates Stripe Customer Portal session
├── Customer can:
│   ├── View billing history
│   ├── Update payment method
│   ├── Cancel subscription
│   ├── Switch plans (upgrade/downgrade)
│   └── Update billing address
└── Returns: { portalUrl } → redirect
```

No need to build a custom subscription management UI — Stripe's portal is production-ready, PCI compliant, and maintained by Stripe.

---

## 5. Digital Content Delivery

### 5.1 Secure Download System

```
┌────────────────────────────────────────────────────────┐
│            Digital Delivery Architecture                │
│                                                         │
│  File Storage:                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Files are stored OUTSIDE the static build output  │  │
│  │                                                    │  │
│  │ Options:                                           │  │
│  │ ├── Local: /cms-storage/downloads/ (standalone)    │  │
│  │ ├── S3-compatible: private bucket (cloud)          │  │
│  │ ├── Cloudflare R2: (edge-optimized)                │  │
│  │ └── Backblaze B2: (cost-optimized)                 │  │
│  │                                                    │  │
│  │ Files are NEVER in /dist or publicly accessible.   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  Download Flow:                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 1. Purchase completed (webhook)                   │  │
│  │    → Generate unique download token (UUID v4)     │  │
│  │    → Store: { token, fileId, orderId, uses, max,  │  │
│  │              expiresAt }                           │  │
│  │                                                    │  │
│  │ 2. Customer clicks download link                  │  │
│  │    → GET /api/shop/downloads/:token               │  │
│  │    → Validate: token exists, not expired,          │  │
│  │      downloads < limit                            │  │
│  │    → Generate signed URL (expires in 5 min)       │  │
│  │    → Redirect to signed URL                       │  │
│  │    → Increment download counter                   │  │
│  │                                                    │  │
│  │ 3. For subscription-gated files:                  │  │
│  │    → Check active subscription status via Stripe  │  │
│  │    → Generate ephemeral signed URL per request    │  │
│  │    → No persistent download token                 │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  File Types Supported:                                  │
│  ├── PDF (e-books, guides, worksheets)                  │
│  ├── EPUB (e-book readers)                              │
│  ├── ZIP (code, assets, bundles)                        │
│  ├── MP4/MOV (video downloads)                          │
│  ├── MP3/WAV (audio content)                            │
│  └── Any file type (configurable)                       │
└────────────────────────────────────────────────────────┘
```

### 5.2 Video Streaming (Courses)

For course video content, downloading is not sufficient. We need streaming with access control:

```
Video Delivery Options:

Option A: Mux (Recommended for production)
├── Upload video via API
├── Mux handles transcoding, CDN, adaptive bitrate
├── Signed playback URLs (time-limited)
├── Viewer analytics built in
├── Cost: per minute of video stored + streamed
└── Integration: Mux Player web component (~5KB)

Option B: Bunny Stream (Budget-friendly)
├── Upload video via API
├── Global CDN with adaptive streaming
├── Token-authenticated URLs
├── Lower cost than Mux
└── Less analytics depth

Option C: Self-hosted (Maximum control)
├── Videos in S3/R2 storage
├── HLS transcoding via FFmpeg at upload time
├── Signed CloudFront/R2 URLs
├── Custom player (Video.js or Plyr, ~15KB)
└── More infrastructure to manage

Recommended default: Mux for courses, self-hosted for simple downloads.
```

### 5.3 Content Access Control

The access control system is the glue between payments and content:

```
Access Rights System:

Every customer has an accessRights[] array, computed from:
├── One-time purchases → permanent access keys
├── Active subscriptions → subscription-tier access keys
└── Course purchases → course-specific access keys

Example accessRights for a customer:
[
  "product:react-ebook",            // Purchased e-book
  "course:react-masterclass",       // Purchased course
  "subscription:pro",               // Active pro subscription
  "tier:premium-content",           // Granted by pro subscription
  "tier:premium-downloads",         // Granted by pro subscription
  "bundle:frontend-2026"            // Purchased bundle
]

Content gating in templates:

Every page/block can declare a `gate` property:
├── gate: null                      → Public (default)
├── gate: "product:react-ebook"     → Requires specific purchase
├── gate: "subscription:pro"        → Requires active subscription
├── gate: "course:react-masterclass"→ Requires course access
├── gate: ["tier:premium-content",
│          "subscription:pro"]      → Requires ANY of these (OR logic)
└── gate: { all: ["sub:pro",
                   "course:react"]} → Requires ALL of these (AND logic)

Build-time vs Runtime gating:

Static pages (build time):
├── Gated content is NOT rendered in HTML
├── A PaywallBlock placeholder is rendered instead
├── "Preview" content (first paragraph, blurred image) shown
└── No content leaks in page source

Runtime (Interactive Island):
├── GateIsland checks /api/shop/access/:resource
├── If authorized: fetch and render gated content
├── If not: show purchase/subscribe CTA
└── Course lessons: check access then load video player
```

---

## 6. Checkout Configuration

### 6.1 Product Type → Checkout Mode Mapping

```
Product Type        Stripe Checkout Mode     Post-Purchase Action
─────────────────────────────────────────────────────────────────
Physical            mode: "payment"          Create order + shipping
Digital (one-time)  mode: "payment"          Generate download tokens
Subscription        mode: "subscription"     Activate access rights
Course (one-time)   mode: "payment"          Grant course access
Course (sub-gated)  mode: "subscription"     Grant course + tier access
Bundle              mode: "payment"          Grant all bundled items
```

### 6.2 Mixed Carts

A cart can contain both one-time and subscription items. Stripe handles this natively:

```
Mixed Cart Handling:

Scenario: Customer buys an e-book ($29) + Pro subscription ($19/mo)

1. Cart contains:
   ├── { priceId: "price_ebook", mode: "payment" }
   └── { priceId: "price_pro_monthly", mode: "subscription" }

2. Stripe Checkout Session created with:
   └── mode: "subscription" (subscription mode handles both)
       ├── line_items: [
       │     { price: "price_pro_monthly", quantity: 1 },
       │     { price: "price_ebook", quantity: 1,
       │       adjustable_quantity: { enabled: false } }
       │   ]
       └── Stripe charges subscription recurring + one-time items

3. Webhooks received:
   ├── checkout.session.completed → grant both accesses
   ├── invoice.paid → subscription renewal (e-book NOT re-charged)
   └── customer.subscription.created → track subscription
```

---

## 7. AI Integration

The shop plugin leverages the existing CMS AI agents — no shop-specific AI is needed.

### 7.1 Content Agent for Commerce

```
AI-Powered Product Content:

Generating product descriptions:
├── Input: product name, category, key features, target audience
├── Context: existing product catalog (for consistent voice)
├── Output: richtext description + short description + tags
└── Can generate variants: professional, casual, technical

Generating category pages:
├── Input: category name, products in category
├── Output: category description, buying guide content
└── AI understands the product relationships

Product comparison content:
├── Input: 2+ product IDs
├── Output: comparison table, pros/cons, recommendation
└── Great for AI-generated "best of" content
```

### 7.2 SEO Agent for Commerce

```
E-Commerce SEO:

Product pages:
├── JSON-LD Product structured data (auto-generated)
├── Meta title/description optimized for purchase intent
├── OpenGraph tags with product images
└── Canonical URLs for variant pages

Category pages:
├── Breadcrumb structured data
├── CollectionPage schema
└── Internal linking suggestions

Sitemaps:
├── Product sitemap with lastmod + priority
├── Category sitemap
├── Image sitemap (all product images)
└── Video sitemap (course promo videos)
```

### 7.3 Media Agent for Commerce

```
Product Image Generation:

├── Generate product mockups from descriptions
├── Generate lifestyle/context images
├── Generate social media product cards
├── Generate OG images for product pages
└── Generate thumbnail variants for product grids

Course Thumbnails:
├── Generate course cover images from title + topic
├── Generate module/lesson thumbnails
└── Generate certificate templates
```

---

## 8. Interactive Islands (Preact Components)

### 8.1 CartIsland

```
CartIsland (~3KB gzipped)

Purpose: Client-side shopping cart with drawer UI

State Management:
├── Cart items stored in localStorage
├── State: { items: [{ priceId, productId, name, price,
│            quantity, variant, image }] }
├── Computed: itemCount, subtotal
└── Events: add, remove, updateQuantity, clear

UI Elements:
├── Cart icon with badge (item count)
├── Slide-out drawer from right
├── Line items with quantity +/- controls
├── Remove button per item
├── Subtotal display
├── "Checkout" button → POST /api/shop/checkout
└── "Continue shopping" → close drawer

Hydration:
├── Static HTML renders empty cart icon
├── Island hydrates, reads localStorage
├── Badge updates with item count
└── ~200ms to interactive on 3G
```

### 8.2 CheckoutButtonBlock

```
CheckoutButtonBlock (~1KB gzipped)

Purpose: "Buy Now" / "Subscribe" button on product pages

Behavior:
├── Single product direct checkout (skip cart)
├── POST /api/shop/checkout with single item
├── Redirect to Stripe Checkout
└── Variant-aware (sends selected variant's priceId)

UI:
├── Button with price display
├── Loading state during API call
└── Error state with retry
```

### 8.3 VariantPickerBlock

```
VariantPickerBlock (~2KB gzipped)

Purpose: Select product variant (size, color, etc.)

Behavior:
├── Reads variants from data attribute (embedded in static HTML)
├── Updates displayed price when variant changes
├── Updates "Add to Cart" button priceId
├── Image swaps if variants have different images
└── Stock display per variant ("3 left" / "Out of stock")
```

### 8.4 GateIsland

```
GateIsland (~2KB gzipped)

Purpose: Protect content behind purchase/subscription gate

Behavior:
├── Checks authentication state (cookie/token)
├── If not logged in → show login/register CTA
├── If logged in → GET /api/shop/access/:resource
├── If authorized → fetch and render gated content
├── If not authorized → show purchase/subscribe CTA
└── For courses: loads video player when authorized

UI:
├── PaywallBlock: blurred preview + CTA overlay
├── DownloadButtonBlock: file icon + download link (authorized)
│   or purchase prompt (unauthorized)
└── LessonVideoBlock: video player (authorized)
    or locked lesson indicator (unauthorized)
```

---

## 9. Development Phases

### Phase 1: Physical & Simple Digital Products (Weeks 1–4)

**Goal:** Basic e-commerce — product pages, cart, Stripe checkout, order management.

```
Deliverables:
├── Plugin scaffold and registration system
│   ├── Plugin manifest and hook registration
│   ├── Collection definitions (products, categories, orders)
│   └── Block type definitions (ProductGrid, ProductCard, Cart, Checkout)
│
├── Stripe integration
│   ├── Product sync (CMS → Stripe)
│   ├── Checkout Session creation
│   ├── Webhook handler (checkout.completed, refund)
│   └── Price sync and management
│
├── Interactive Islands
│   ├── CartIsland (add, remove, quantity, drawer UI)
│   ├── CheckoutButtonBlock (direct buy)
│   └── VariantPickerBlock (variant selection)
│
├── Build pipeline integration
│   ├── Product page template generation
│   ├── Category page template generation
│   ├── JSON-LD structured data injection
│   └── Product sitemap generation
│
├── Admin dashboard extensions
│   ├── Product management UI (CRUD + image upload)
│   ├── Order list and detail views
│   ├── Basic sales dashboard (total revenue, order count)
│   └── Stripe connection setup wizard
│
├── Simple digital downloads
│   ├── File upload to secure storage
│   ├── Download token generation on purchase
│   ├── Signed URL download endpoint
│   └── Download limit enforcement
│
└── Tests
    ├── Stripe sync tests (mock Stripe API)
    ├── Checkout flow integration tests
    ├── Webhook handler tests
    └── Download token security tests

Milestone: Full product-to-checkout-to-delivery flow working.
A customer can browse static product pages, add to cart, checkout
via Stripe, and receive download links for digital products.
```

### Phase 2: Digital Content Library (Weeks 5–8)

**Goal:** Rich digital product delivery — e-books, video downloads, file bundles, preview system.

```
Deliverables:
├── Enhanced digital product system
│   ├── Multi-file products (e.g., e-book PDF + EPUB + audiobook)
│   ├── File bundle support (ZIP auto-generation)
│   ├── Preview/sample file system (free excerpt before purchase)
│   ├── Download expiry and limit management
│   └── Download history tracking per customer
│
├── Customer accounts
│   ├── Customer collection and management
│   ├── Purchase history view
│   ├── Digital library ("My Downloads")
│   ├── Re-download capability within limits
│   └── Email-based authentication (magic link)
│
├── Email notifications
│   ├── Order confirmation with download links
│   ├── Download reminder (before expiry)
│   ├── New product notification (opt-in)
│   └── Email templates (AI-generated, branded)
│
├── Enhanced admin
│   ├── Digital product file management UI
│   ├── Download analytics (which files, how often)
│   ├── Customer browser (search, filter, view history)
│   └── Revenue analytics (daily, weekly, monthly, by product)
│
├── AI enhancements
│   ├── Auto-generate product descriptions from file content
│   │   (e.g., read PDF table of contents → generate description)
│   ├── Auto-generate preview excerpts
│   └── Related product suggestions
│
└── Storage adapter integration
    ├── S3-compatible upload and signed URLs
    ├── Cloudflare R2 support
    └── Storage usage tracking and reporting

Milestone: Full digital content store. Author uploads an e-book
PDF, AI generates the product description and preview, customer
purchases and receives time-limited download links. Customer can
log in to re-download from their library.
```

### Phase 3: Subscriptions & Memberships (Weeks 9–12)

**Goal:** Recurring payments with content gating — members-only content, premium tiers.

```
Deliverables:
├── Subscription product type
│   ├── Stripe Subscription integration
│   │   ├── Monthly/yearly billing cycles
│   │   ├── Free trial support
│   │   ├── Upgrade/downgrade between plans
│   │   └── Proration handling
│   ├── Subscription plan management in admin
│   └── Multiple plan tiers (e.g., Basic, Pro, Enterprise)
│
├── Content gating system
│   ├── Access rights engine
│   │   ├── Compute rights from purchases + subscriptions
│   │   ├── Real-time subscription status check via Stripe
│   │   └── Cache access state with short TTL
│   ├── PaywallBlock (interactive island)
│   │   ├── Blurred content preview
│   │   ├── Subscription CTA with plan comparison
│   │   └── Login prompt for existing subscribers
│   ├── Build-time gating
│   │   ├── Gated content excluded from static HTML
│   │   ├── Preview content rendered (first paragraph, etc.)
│   │   └── Gate metadata embedded for island hydration
│   └── Gate configuration per page, block, or collection
│
├── Customer portal
│   ├── Stripe Customer Portal integration
│   │   ├── Manage subscription (cancel, switch plan)
│   │   ├── Update payment method
│   │   └── View invoices
│   ├── Members-only dashboard
│   │   ├── Active subscription status
│   │   ├── Accessible content overview
│   │   └── Billing history
│   └── Session management (secure cookies, JWT)
│
├── Subscription webhooks
│   ├── invoice.paid → extend access
│   ├── invoice.payment_failed → grace period, email notification
│   ├── customer.subscription.updated → sync plan changes
│   ├── customer.subscription.deleted → revoke access
│   └── customer.subscription.trial_will_end → reminder email
│
├── PricingTableBlock
│   ├── Static comparison table (build-time)
│   ├── Feature matrix with tiers
│   ├── Interactive plan selection (island)
│   └── AI-generated feature descriptions
│
└── Membership content workflow
    ├── Mark content as "members-only" in editor
    ├── Set required tier per content piece
    ├── Preview for non-members (teaser text + blurred)
    └── Seamless unlock on subscription activation

Milestone: Full membership site. Visitors see blurred premium
content, subscribe via Stripe, get instant access. Subscribers
manage billing through Stripe Portal. Content access automatically
revoked on cancellation.
```

### Phase 4: Course Platform (Weeks 13–18)

**Goal:** Full learning management — video courses, progress tracking, quizzes, certificates.

```
Deliverables:
├── Course content system
│   ├── Courses collection with module/lesson structure
│   ├── Lesson types: video, text, quiz, assignment, download
│   ├── Course outline page (static, with gating indicators)
│   ├── Lesson page template
│   └── Sequential unlock (complete lesson N before N+1, optional)
│
├── Video delivery
│   ├── Mux integration (primary)
│   │   ├── Upload API integration
│   │   ├── Signed playback URL generation
│   │   ├── Adaptive bitrate streaming
│   │   └── Viewer engagement analytics
│   ├── Video player island (Mux Player, ~5KB)
│   │   ├── Playback position persistence
│   │   ├── Speed control (1x, 1.5x, 2x)
│   │   ├── Chapter navigation
│   │   └── Captions/subtitle toggle
│   ├── Self-hosted fallback (S3/R2 + HLS)
│   └── YouTube/Vimeo embed support (for free previews)
│
├── Progress tracking
│   ├── Lesson completion tracking
│   │   ├── Video: auto-complete at 90% watched
│   │   ├── Text: mark complete button
│   │   ├── Quiz: complete on passing score
│   │   └── Assignment: manual instructor approval
│   ├── Course progress percentage
│   ├── "Continue where you left off" feature
│   ├── Module completion indicators
│   └── Progress data stored per customer
│
├── Quiz engine
│   ├── Multiple choice questions
│   ├── True/false questions
│   ├── Free-text answers (AI-graded, optional)
│   ├── Score calculation and pass/fail
│   ├── Retry capability (configurable)
│   └── Quiz results stored in progress
│
├── Certificate generation
│   ├── SVG/PDF certificate template system
│   ├── Auto-fill: student name, course title, date, score
│   ├── Unique certificate ID for verification
│   ├── Public verification URL (/verify/:certId)
│   └── AI-generated template from brand guidelines
│
├── AI course features
│   ├── Auto-generate video transcripts
│   ├── Auto-generate captions (multi-language)
│   ├── Auto-generate quiz questions from lesson content
│   ├── Auto-generate lesson summaries
│   └── AI study assistant (chat about course content)
│
├── Course admin
│   ├── Course builder UI (drag/drop modules and lessons)
│   ├── Video upload with progress indicator
│   ├── Student roster and progress overview
│   ├── Engagement analytics (completion rates, drop-off)
│   └── Revenue per course reporting
│
└── Course discovery
    ├── Course catalog page (static)
    ├── Course card component
    ├── Filter by category, difficulty, price
    ├── Free preview lessons (configurable count)
    └── Instructor profile pages

Milestone: Full course platform. Instructor creates course with
video lessons and quizzes. Student purchases access, watches
videos with progress tracking, completes quizzes, receives
certificate. AI generates transcripts and captions automatically.
```

### Phase 5: Advanced Commerce (Weeks 19–24)

**Goal:** Enterprise-grade commerce features — bundles, affiliates, analytics, multi-currency.

```
Deliverables:
├── Product bundles
│   ├── Bundle products at discounted price
│   ├── "Complete course library" type bundles
│   ├── Time-limited bundle offers
│   ├── Individual access rights per bundle item
│   └── Stripe handles bundle pricing
│
├── Discount and coupon system
│   ├── Stripe Coupon/Promotion Code integration
│   ├── Percentage or fixed amount discounts
│   ├── Duration: once, repeating, forever (subscriptions)
│   ├── Usage limits per code
│   ├── Coupon code input in checkout
│   └── Admin UI for coupon management
│
├── Affiliate / referral system
│   ├── Unique referral links per affiliate
│   ├── Cookie-based attribution (30-day window)
│   ├── Commission tracking (percentage of sale)
│   ├── Payout reporting (manual initially)
│   ├── Affiliate dashboard (sales, earnings, links)
│   └── Stripe Connect for automated payouts (future)
│
├── Multi-currency support
│   ├── Stripe multi-currency pricing
│   ├── Auto-detect currency from visitor geolocation
│   ├── Display local currency on static pages (build-time variants)
│   └── Currency selector component
│
├── Tax handling
│   ├── Stripe Tax integration (automatic calculation)
│   ├── Digital goods VAT/GST handling
│   ├── Tax-inclusive/exclusive price display
│   └── Tax receipts in customer portal
│
├── Advanced analytics
│   ├── Sales funnel visualization
│   │   (page view → add to cart → checkout → purchase)
│   ├── Revenue dashboards (MRR, churn, LTV, ARPU)
│   ├── Product performance comparison
│   ├── Course engagement metrics (completion, time spent)
│   ├── Cohort analysis (retention by signup month)
│   └── AI-powered insights ("revenue dipped 15%, likely due to...")
│
├── Upsell / cross-sell engine
│   ├── "Customers also bought" (data-driven)
│   ├── Post-purchase upsell page
│   ├── In-course upsells ("Upgrade to get advanced modules")
│   ├── Cart abandonment (email trigger, future)
│   └── AI-recommended upsells based on purchase history
│
├── Import / migration tools
│   ├── Import from Gumroad (products + customers)
│   ├── Import from Teachable/Thinkific (courses)
│   ├── Import from WooCommerce (products + orders)
│   ├── Import from Shopify (products + customers)
│   └── CSV import for bulk products
│
└── API for external integrations
    ├── Order webhooks (external fulfillment)
    ├── Customer webhooks (CRM integration)
    ├── Zapier / Make compatible webhook format
    └── Public API for headless storefront

Milestone: Full enterprise commerce platform. Multi-currency
product catalog with bundles, affiliate tracking, sophisticated
analytics, and upsell engine. Can serve as the commerce backbone
for a content-driven business selling physical products, digital
downloads, subscriptions, and courses.
```

---

## 10. Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Payment provider | Stripe | Best API, handles subscriptions/tax/global payments |
| Cart state | localStorage + Preact island | Zero server cost, instant UX, static-compatible |
| Video hosting | Mux (primary), self-hosted (fallback) | Adaptive streaming, analytics, signed URLs |
| Download security | Signed URLs with time expiry | No proxy needed, scales to CDN, secure |
| Access control | JWT in httpOnly cookie | Secure, works with static pages + API |
| Island framework | Preact | 3KB, React-compatible API, proven pattern |
| Email | Resend or Postmark via CMS hook | Transactional email, not marketing automation |
| Course progress | CMS storage (SQLite/Postgres) | Tied to content model, queryable for analytics |
| Certificate gen | SVG template → PDF conversion | Resolution-independent, brand-customizable |
| Subscription mgmt | Stripe Customer Portal | Zero UI to build, PCI compliant, maintained |

---

## 11. Plugin Configuration

The shop plugin is configured in `cms.config.ts`:

```
Configuration schema for shop plugin:

shop:
├── stripe:
│   ├── secretKey (from .env: STRIPE_SECRET_KEY)
│   ├── webhookSecret (from .env: STRIPE_WEBHOOK_SECRET)
│   ├── publicKey (from .env: STRIPE_PUBLIC_KEY)
│   └── portalReturnUrl (default: "/account")
│
├── products:
│   ├── defaultCurrency ("usd", "eur", "dkk", etc.)
│   ├── enableVariants (boolean, default true)
│   ├── enableDigital (boolean, default true)
│   ├── enableSubscriptions (boolean, default false)
│   ├── enableCourses (boolean, default false)
│   └── inventoryTracking (boolean, default false)
│
├── checkout:
│   ├── successUrl ("/order/success")
│   ├── cancelUrl ("/cart")
│   ├── enableTax (boolean, default false — requires Stripe Tax)
│   ├── shippingCountries (string[] — ISO country codes)
│   └── allowPromotionCodes (boolean, default false)
│
├── digital:
│   ├── storageAdapter ("local" | "s3" | "r2")
│   ├── defaultDownloadLimit (number, default 5)
│   ├── defaultDownloadExpiry (number, hours, default 168 = 7 days)
│   └── storageConfig ({ bucket, region, endpoint })
│
├── courses:
│   ├── videoProvider ("mux" | "bunny" | "self-hosted")
│   ├── videoConfig ({ apiToken, ... })
│   ├── enableCertificates (boolean, default false)
│   ├── enableQuizzes (boolean, default true)
│   ├── sequentialLessons (boolean, default false)
│   └── freePreviewLessons (number, default 1)
│
├── email:
│   ├── provider ("resend" | "postmark" | "sendgrid")
│   ├── fromAddress ("shop@example.com")
│   └── templates (overrideable email templates)
│
└── advanced:
    ├── enableAffiliates (boolean, default false)
    ├── enableBundles (boolean, default false)
    ├── enableUpsells (boolean, default false)
    └── analyticsRetention (number, days, default 365)
```

---

## 12. Success Metrics

### Phase 1 (Basic Shop)
- Product page Lighthouse score: **95+**
- Checkout to payment completion: **< 3 clicks**
- Cart island total JS: **< 5KB gzipped**
- Time from `npx @webhouse/cms init` with shop plugin to first product live: **< 15 minutes**

### Phase 2 (Digital Content)
- Download delivery latency: **< 2 seconds** (signed URL generation)
- File security: zero public URL leaks in HTML source
- Customer re-download success rate: **100%** (within limits)

### Phase 3 (Subscriptions)
- Subscription activation to content access: **< 5 seconds** (webhook → access grant)
- Gated content zero-leak: no premium content in static HTML source
- Churn recovery: grace period + retry handling covers **80%** of failed payments

### Phase 4 (Courses)
- Video start latency: **< 3 seconds** (Mux adaptive streaming)
- Progress persistence: **zero data loss** across sessions
- Certificate generation: **< 10 seconds**

### Phase 5 (Advanced)
- Multi-currency price accuracy: **real-time** (Stripe-sourced)
- Analytics dashboard load: **< 2 seconds**
- Affiliate tracking accuracy: **99%+** attribution

---

## 13. Open Questions

1. **Shipping integration** — Should we integrate ShipStation/EasyPost for physical product shipping, or keep it manual for Phase 1?
2. **Inventory management** — How sophisticated should stock tracking be? Simple "in stock / out of stock" or full inventory with warehouse support?
3. **Multi-vendor marketplace** — Should the plugin support multiple sellers on one site (Stripe Connect), or is that a separate plugin?
4. **Course authoring AI** — Should the AI be able to generate entire course outlines from a topic, or just assist with individual lesson content?
5. **Offline video** — Should course videos be downloadable for offline viewing (DRM implications)?
6. **Community features** — Discussion forums per course/lesson? Comments? Peer review of assignments?
7. **Payment plans** — Should we support "pay in 4 installments" beyond what Stripe/Klarna already offer?
8. **White-label** — Should the course platform be white-labelable for instructors who want their own branded academy?
9. **Mobile app** — Should course content be consumable via a mobile app (React Native wrapper)?
10. **Webhooks for external LMS** — Should course completion events be publishable to external systems (for corporate training, CPE credits)?

---

*This document is a plugin architecture specification for `@webhouse/cms-plugin-shop`. Implementation follows the phased approach, with each phase producing its own detailed technical design before development begins. The plugin depends on and extends the core CMS engine architecture defined in CMS-ENGINE.md.*
