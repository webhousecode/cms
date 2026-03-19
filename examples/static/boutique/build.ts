/**
 * AURA. Boutique — Static site build pipeline
 *
 * Reads ALL content from JSON files in content/ and generates
 * a complete static site into dist/.
 *
 * Usage:  npx tsx build.ts
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ProductData {
  slug: string;
  status: string;
  data: {
    title: string;
    price: number;
    description: string;
    category: string;
    heroImage: string;
    images: string[];
    sizes: string[];
    color: string;
    material: string;
    featured: boolean;
    sortOrder: number;
  };
}

interface SiteSettings {
  slug: string;
  status: string;
  data: {
    siteName: string;
    tagline: string;
    heroHeading: string;
    heroSubheading: string;
    heroCta: string;
    heroCtaUrl: string;
    heroImage: string;
    brandStoryHeading: string;
    brandStoryText: string;
    newsletterHeading: string;
    newsletterSubtext: string;
    footerText: string;
    instagramUrl: string;
    twitterUrl: string;
    email: string;
    galleryImages: string[];
  };
}

interface PageData {
  slug: string;
  status: string;
  data: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Load content
// ---------------------------------------------------------------------------
function loadCollection<T>(dir: string): T[] {
  const fullDir = join(__dirname, dir);
  return readdirSync(fullDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(fullDir, f), 'utf-8')) as T)
    .filter((item: any) => item.status === 'published');
}

function loadSingle<T>(path: string): T {
  return JSON.parse(readFileSync(join(__dirname, path), 'utf-8')) as T;
}

const site = loadSingle<SiteSettings>('content/globals/site.json');
const homePage = loadSingle<PageData>('content/pages/home.json');
const shopPage = loadSingle<PageData>('content/pages/shop.json');

const products = loadCollection<ProductData>('content/products').sort(
  (a, b) => a.data.sortOrder - b.data.sortOrder
);
const featuredProducts = products.filter((p) => p.data.featured);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function nl2p(s: string): string {
  return s
    .split('\n')
    .filter((p) => p.trim())
    .map((p) => `<p>${esc(p)}</p>`)
    .join('\n            ');
}

function formatPrice(n: number): string {
  return `$${n}`;
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------
const icons = {
  instagram: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  cart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
};

// ---------------------------------------------------------------------------
// Shared CSS
// ---------------------------------------------------------------------------
const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #faf9f7;
  --text: #1a1a1a;
  --muted: #6b6b6b;
  --border: #e5e3df;
  --white: #fff;
  --font-serif: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

html { scroll-behavior: smooth; }

body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
  font-weight: 300;
}

a { color: var(--text); text-decoration: none; }
img { display: block; max-width: 100%; }

/* ---- Header ---- */
.site-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 1.25rem 2.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(250, 249, 247, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid transparent;
  transition: border-color 0.3s ease;
}

.site-header.scrolled {
  border-bottom-color: var(--border);
}

.logo {
  font-family: var(--font-serif);
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text);
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.header-nav a {
  font-size: 0.8125rem;
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  transition: color 0.2s ease;
}

.header-nav a:hover { color: var(--text); }

.header-icons {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.header-icons a {
  color: var(--muted);
  transition: color 0.2s ease;
  display: flex;
  align-items: center;
}

.header-icons a:hover { color: var(--text); }

/* ---- Hero ---- */
.hero {
  position: relative;
  height: 100vh;
  min-height: 600px;
  overflow: hidden;
}

.hero-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0,0,0,0.05) 0%,
    rgba(0,0,0,0.25) 100%
  );
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
}

.hero-heading {
  font-family: var(--font-serif);
  font-size: clamp(3rem, 8vw, 6rem);
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--white);
  line-height: 1.1;
  margin-bottom: 0.75rem;
}

.hero-sub {
  font-family: var(--font-sans);
  font-size: clamp(0.875rem, 1.5vw, 1.125rem);
  font-weight: 300;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.85);
  margin-bottom: 2.5rem;
}

.hero-cta {
  display: inline-block;
  padding: 1rem 3rem;
  background: var(--white);
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  transition: background 0.3s ease, color 0.3s ease;
}

.hero-cta:hover {
  background: var(--text);
  color: var(--white);
}

/* ---- Featured Products ---- */
.featured-section {
  padding: 6rem 2.5rem;
}

.section-title {
  font-family: var(--font-serif);
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 400;
  text-align: center;
  margin-bottom: 4rem;
  letter-spacing: 0.02em;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.product-card {
  display: block;
  text-decoration: none;
  color: var(--text);
}

.product-card-image {
  position: relative;
  width: 100%;
  aspect-ratio: 3/4;
  overflow: hidden;
  background: #f0efec;
}

.product-card-image img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.6s ease;
}

.product-card-image .product-img-hover {
  opacity: 0;
}

.product-card:hover .product-img-hover {
  opacity: 1;
}

.product-card:hover .product-img-main {
  opacity: 0;
}

.product-card-info {
  padding: 1rem 0;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.product-card-title {
  font-family: var(--font-serif);
  font-size: 1.125rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.product-card-price {
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--muted);
}

/* ---- Brand Story ---- */
.brand-story {
  padding: 6rem 2.5rem 7rem;
  text-align: center;
  max-width: 680px;
  margin: 0 auto;
}

.brand-story h2 {
  font-family: var(--font-serif);
  font-size: clamp(2rem, 4vw, 2.75rem);
  font-weight: 400;
  margin-bottom: 2rem;
  letter-spacing: 0.02em;
}

.brand-story p {
  font-size: 1rem;
  line-height: 1.85;
  color: var(--muted);
  margin-bottom: 1.5rem;
  font-weight: 300;
}

/* ---- Editorial Gallery ---- */
.gallery-section {
  padding: 2rem 2.5rem 6rem;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 280px;
  gap: 0.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.gallery-item {
  overflow: hidden;
  position: relative;
}

.gallery-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.8s ease;
}

.gallery-item:hover img {
  transform: scale(1.05);
}

.gallery-item:nth-child(1) { grid-row: span 2; }
.gallery-item:nth-child(4) { grid-row: span 2; }
.gallery-item:nth-child(7) { grid-column: span 2; }

/* ---- Newsletter ---- */
.newsletter-section {
  padding: 6rem 2.5rem;
  text-align: center;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.newsletter-section h2 {
  font-family: var(--font-serif);
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
  font-weight: 400;
  margin-bottom: 1rem;
  letter-spacing: 0.02em;
}

.newsletter-section p {
  font-size: 0.9375rem;
  color: var(--muted);
  margin-bottom: 2rem;
  font-weight: 300;
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 2.5rem;
}

.newsletter-form {
  display: flex;
  max-width: 440px;
  margin: 0 auto;
  border: 1px solid var(--border);
}

.newsletter-form input {
  flex: 1;
  padding: 0.875rem 1.25rem;
  border: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 300;
  color: var(--text);
  outline: none;
}

.newsletter-form input::placeholder {
  color: #b5b3ae;
}

.newsletter-form button {
  padding: 0.875rem 2rem;
  background: var(--text);
  color: var(--white);
  border: none;
  font-family: var(--font-sans);
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.3s ease;
}

.newsletter-form button:hover {
  background: #333;
}

/* ---- Footer ---- */
.site-footer {
  padding: 4rem 2.5rem 2.5rem;
}

.footer-inner {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 2rem;
}

.footer-brand .logo {
  font-size: 1.5rem;
  display: block;
  margin-bottom: 0.75rem;
}

.footer-tagline {
  font-size: 0.8125rem;
  color: var(--muted);
  max-width: 280px;
  line-height: 1.7;
  font-weight: 300;
}

.footer-links {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

.footer-links a {
  color: var(--muted);
  font-size: 0.8125rem;
  letter-spacing: 0.05em;
  transition: color 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.footer-links a:hover { color: var(--text); }

.footer-bottom {
  max-width: 1400px;
  margin: 3rem auto 0;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #b5b3ae;
}

.footer-bottom a {
  color: #b5b3ae;
  transition: color 0.2s ease;
}

.footer-bottom a:hover { color: var(--text); }

/* ---- Shop Page ---- */
.shop-header {
  padding: 10rem 2.5rem 3rem;
  text-align: center;
}

.shop-header h1 {
  font-family: var(--font-serif);
  font-size: clamp(3rem, 8vw, 5rem);
  font-weight: 400;
  letter-spacing: 0.04em;
}

.shop-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  padding: 2rem 2.5rem 6rem;
  max-width: 1400px;
  margin: 0 auto;
}

.shop-card-sizes {
  font-size: 0.75rem;
  color: #b5b3ae;
  letter-spacing: 0.05em;
  margin-top: 0.25rem;
}

.shop-card-link {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  padding-bottom: 2px;
  transition: color 0.2s ease, border-color 0.2s ease;
}

.product-card:hover .shop-card-link {
  color: var(--text);
  border-color: var(--text);
}

/* ---- Product Detail ---- */
.product-detail {
  padding: 7rem 2.5rem 4rem;
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: start;
}

.product-gallery {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.product-gallery img {
  width: 100%;
  aspect-ratio: 3/4;
  object-fit: cover;
}

.product-info {
  position: sticky;
  top: 6rem;
  padding: 2rem 0;
}

.product-breadcrumb {
  font-size: 0.75rem;
  color: #b5b3ae;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 2rem;
}

.product-breadcrumb a {
  color: #b5b3ae;
  transition: color 0.2s ease;
}

.product-breadcrumb a:hover { color: var(--text); }

.product-info h1 {
  font-family: var(--font-serif);
  font-size: clamp(2rem, 4vw, 2.75rem);
  font-weight: 400;
  letter-spacing: 0.02em;
  margin-bottom: 0.75rem;
}

.product-price {
  font-size: 1.125rem;
  color: var(--muted);
  margin-bottom: 2rem;
  font-weight: 300;
}

.product-description {
  font-size: 0.9375rem;
  line-height: 1.85;
  color: var(--muted);
  margin-bottom: 2.5rem;
  font-weight: 300;
}

.product-meta-row {
  display: flex;
  justify-content: space-between;
  padding: 0.875rem 0;
  border-top: 1px solid var(--border);
  font-size: 0.8125rem;
}

.product-meta-label {
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-size: 0.6875rem;
  color: var(--muted);
}

.product-meta-value {
  color: var(--text);
}

.product-sizes {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin: 1.5rem 0;
}

.size-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--border);
  font-size: 0.75rem;
  font-weight: 400;
  letter-spacing: 0.08em;
  transition: all 0.2s ease;
  cursor: pointer;
}

.size-pill:hover {
  border-color: var(--text);
  background: var(--text);
  color: var(--white);
}

.add-to-cart {
  display: block;
  width: 100%;
  padding: 1.125rem;
  margin-top: 2rem;
  background: var(--text);
  color: var(--white);
  border: none;
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.3s ease;
  text-align: center;
}

.add-to-cart:hover {
  background: #333;
}

/* ---- Responsive ---- */
@media (max-width: 1024px) {
  .products-grid,
  .shop-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .gallery-grid {
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 220px;
  }
}

@media (max-width: 768px) {
  .site-header { padding: 1rem 1.25rem; }
  .logo { font-size: 1.375rem; }
  .header-nav { gap: 1.25rem; }
  .header-nav a { font-size: 0.6875rem; }

  .featured-section,
  .brand-story,
  .gallery-section,
  .newsletter-section { padding-left: 1.25rem; padding-right: 1.25rem; }

  .products-grid,
  .shop-grid {
    grid-template-columns: 1fr;
    gap: 2.5rem;
  }

  .gallery-grid {
    grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: 180px;
  }

  .gallery-item:nth-child(1),
  .gallery-item:nth-child(4) { grid-row: span 1; }
  .gallery-item:nth-child(7) { grid-column: span 1; }

  .newsletter-form { flex-direction: column; }
  .newsletter-form button { padding: 1rem; }

  .product-detail {
    grid-template-columns: 1fr;
    gap: 2rem;
    padding: 5rem 1.25rem 4rem;
  }

  .product-info { position: static; }

  .shop-header { padding: 7rem 1.25rem 2rem; }
  .shop-grid { padding: 2rem 1.25rem 4rem; }
}
`;

// ---------------------------------------------------------------------------
// Shared HTML parts
// ---------------------------------------------------------------------------
function head(title: string, description: string, extra: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
  <style>${CSS}${extra}</style>
</head>`;
}

function header(): string {
  return `
  <header class="site-header" id="site-header">
    <a href="/" class="logo">${esc(site.data.siteName)}</a>
    <div class="header-nav">
      <a href="/shop/">Shop</a>
      <div class="header-icons">
        <a href="${esc(site.data.instagramUrl)}" aria-label="Instagram" target="_blank" rel="noopener">${icons.instagram}</a>
        <a href="${esc(site.data.twitterUrl)}" aria-label="X / Twitter" target="_blank" rel="noopener">${icons.x}</a>
        <a href="#" aria-label="Cart">${icons.cart}</a>
      </div>
    </div>
  </header>`;
}

function footer(): string {
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a href="/" class="logo">${esc(site.data.siteName)}</a>
        <p class="footer-tagline">${esc(site.data.footerText)}</p>
      </div>
      <div class="footer-links">
        <a href="${esc(site.data.instagramUrl)}" target="_blank" rel="noopener">${icons.instagram} Instagram</a>
        <a href="${esc(site.data.twitterUrl)}" target="_blank" rel="noopener">${icons.x} Twitter</a>
        <a href="mailto:${esc(site.data.email)}">${esc(site.data.email)}</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; ${new Date().getFullYear()} ${esc(site.data.siteName)} All rights reserved.</span>
      <span>Built with <a href="https://webhouse.app">@webhouse/cms</a></span>
    </div>
  </footer>`;
}

function scrollScript(): string {
  return `
  <script>
    const h = document.getElementById('site-header');
    window.addEventListener('scroll', () => {
      h.classList.toggle('scrolled', window.scrollY > 10);
    });
  </script>`;
}

// ---------------------------------------------------------------------------
// Product card (reused on home + shop)
// ---------------------------------------------------------------------------
function productCard(p: ProductData, showSizes: boolean = false): string {
  const hoverImg = p.data.images && p.data.images.length > 1 ? p.data.images[1] : p.data.heroImage;
  return `
        <a href="/shop/${p.slug}/" class="product-card">
          <div class="product-card-image">
            <img src="${esc(p.data.heroImage)}" alt="${esc(p.data.title)}" class="product-img-main" loading="lazy">
            <img src="${esc(hoverImg)}" alt="${esc(p.data.title)}" class="product-img-hover" loading="lazy">
          </div>
          <div class="product-card-info">
            <span class="product-card-title">${esc(p.data.title)}</span>
            <span class="product-card-price">${formatPrice(p.data.price)}</span>
          </div>${showSizes ? `
          <div class="shop-card-sizes">${p.data.sizes.join(' / ')}</div>
          <span class="shop-card-link">View</span>` : ''}
        </a>`;
}

// ---------------------------------------------------------------------------
// Page: Home
// ---------------------------------------------------------------------------
function buildHome(): string {
  const featuredHtml = featuredProducts.map((p) => productCard(p)).join('\n');

  const galleryHtml = site.data.galleryImages
    .map(
      (url, i) => `
          <div class="gallery-item">
            <img src="${esc(url)}" alt="Editorial image ${i + 1}" loading="lazy">
          </div>`
    )
    .join('\n');

  return `${head(homePage.data.title, homePage.data.metaDescription)}
<body>
${header()}

  <section class="hero">
    <img src="${esc(site.data.heroImage)}" alt="${esc(site.data.heroHeading)}" class="hero-image">
    <div class="hero-overlay">
      <h1 class="hero-heading">${esc(site.data.heroHeading)}</h1>
      <p class="hero-sub">${esc(site.data.heroSubheading)}</p>
      <a href="${esc(site.data.heroCtaUrl)}" class="hero-cta">${esc(site.data.heroCta)}</a>
    </div>
  </section>

  <section class="featured-section">
    <h2 class="section-title">Selected Pieces</h2>
    <div class="products-grid">
${featuredHtml}
    </div>
  </section>

  <section class="brand-story">
    <h2>${esc(site.data.brandStoryHeading)}</h2>
    ${nl2p(site.data.brandStoryText)}
  </section>

  <section class="gallery-section">
    <h2 class="section-title">The Edit</h2>
    <div class="gallery-grid">
${galleryHtml}
    </div>
  </section>

  <section class="newsletter-section">
    <h2>${esc(site.data.newsletterHeading)}</h2>
    <p>${esc(site.data.newsletterSubtext)}</p>
    <form class="newsletter-form" onsubmit="return false;">
      <input type="email" placeholder="Your email address" aria-label="Email address">
      <button type="submit">Subscribe</button>
    </form>
  </section>

${footer()}
${scrollScript()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page: Shop
// ---------------------------------------------------------------------------
function buildShop(): string {
  const gridHtml = products.map((p) => productCard(p, true)).join('\n');

  return `${head(shopPage.data.title, shopPage.data.metaDescription)}
<body>
${header()}

  <div class="shop-header">
    <h1>Shop</h1>
  </div>

  <div class="shop-grid">
${gridHtml}
  </div>

${footer()}
${scrollScript()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page: Product detail
// ---------------------------------------------------------------------------
function buildProductDetail(product: ProductData): string {
  const { data } = product;

  const galleryHtml = data.images
    .map(
      (url, i) => `
          <img src="${esc(url)}" alt="${esc(data.title)} — image ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}">`
    )
    .join('\n');

  const sizesHtml = data.sizes
    .map((s) => `<span class="size-pill">${esc(s)}</span>`)
    .join('\n            ');

  return `${head(`${data.title} — ${site.data.siteName}`, data.description.slice(0, 160))}
<body>
${header()}

  <div class="product-detail">
    <div class="product-gallery">
${galleryHtml}
    </div>

    <div class="product-info">
      <div class="product-breadcrumb">
        <a href="/">Home</a> &mdash; <a href="/shop/">Shop</a> &mdash; ${esc(cap(data.category))}
      </div>
      <h1>${esc(data.title)}</h1>
      <p class="product-price">${formatPrice(data.price)}</p>
      <p class="product-description">${esc(data.description)}</p>

      <div class="product-meta-row">
        <span class="product-meta-label">Color</span>
        <span class="product-meta-value">${esc(data.color)}</span>
      </div>
      <div class="product-meta-row">
        <span class="product-meta-label">Material</span>
        <span class="product-meta-value">${esc(data.material)}</span>
      </div>
      <div class="product-meta-row" style="border-bottom: 1px solid var(--border);">
        <span class="product-meta-label">Category</span>
        <span class="product-meta-value">${esc(cap(data.category))}</span>
      </div>

      <div class="product-sizes">
        ${sizesHtml}
      </div>

      <button class="add-to-cart">Add to Cart</button>
    </div>
  </div>

${footer()}
${scrollScript()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Write all pages
// ---------------------------------------------------------------------------
const dist = join(__dirname, 'dist');

console.log('Building AURA. boutique...\n');

// Home
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'index.html'), buildHome(), 'utf-8');
console.log('  dist/index.html');

// Shop index
const shopDir = join(dist, 'shop');
mkdirSync(shopDir, { recursive: true });
writeFileSync(join(shopDir, 'index.html'), buildShop(), 'utf-8');
console.log('  dist/shop/index.html');

// Product detail pages
for (const product of products) {
  const dir = join(shopDir, product.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), buildProductDetail(product), 'utf-8');
  console.log(`  dist/shop/${product.slug}/index.html`);
}

console.log(`\nBuilt ${2 + products.length} pages.`);
