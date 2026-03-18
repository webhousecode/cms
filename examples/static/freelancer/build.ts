/**
 * Freelancer site build pipeline
 *
 * Reads content JSON files and generates a complete static site
 * with Home, Services, Blog listing, Blog posts, and Contact pages.
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
interface Feature {
  text: string;
}

interface Service {
  slug: string;
  data: {
    title: string;
    description: string;
    features: Feature[];
    price: string;
    popular: boolean;
  };
}

interface Testimonial {
  slug: string;
  data: {
    name: string;
    role: string;
    company: string;
    quote: string;
    photo: string;
  };
}

interface Post {
  slug: string;
  data: {
    title: string;
    excerpt: string;
    content: string;
    date: string;
    coverImage: string;
  };
}

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

interface NavLink {
  label: string;
  href: string;
  key: string;
}

interface SocialLink {
  label: string;
  href: string;
}

interface HomePage {
  slug: string;
  data: {
    title: string;
    metaDescription: string;
    name: string;
    jobTitle: string;
    heroTagline: string;
    heroCta1: string;
    heroCta2: string;
    trustLabel: string;
    trustCompanies: string[];
    servicesLabel: string;
    servicesTitle: string;
    servicesDesc: string;
    testimonialsLabel: string;
    testimonialsTitle: string;
    testimonialsDesc: string;
    blogLabel: string;
    blogTitle: string;
    blogDesc: string;
    ctaTitle: string;
    ctaDesc: string;
    ctaButton: string;
    footerDesc: string;
    footerColumns: FooterColumn[];
    navCta: string;
    navLinks: NavLink[];
    socialLinks: SocialLink[];
    copyrightSuffix: string;
  };
}

interface ServicesPage {
  slug: string;
  data: {
    title: string;
    metaDescription: string;
    pricingLabel: string;
    pricingTitle: string;
    pricingDesc: string;
    ctaTitle: string;
    ctaDesc: string;
    ctaButton: string;
    popularBadge: string;
    cardButton: string;
  };
}

interface ContactPage {
  slug: string;
  data: {
    title: string;
    metaDescription: string;
    sectionLabel: string;
    heading: string;
    description: string;
    contactDetails: {
      label: string;
      value: string;
      icon: string;
    }[];
    formFields: {
      id: string;
      label: string;
      type: string;
      placeholder: string;
      row?: number;
    }[];
    submitButton: string;
  };
}

interface BlogPage {
  slug: string;
  data: {
    title: string;
    metaDescription: string;
    listingLabel: string;
    listingTitle: string;
    listingDesc: string;
    postCtaTitle: string;
    postCtaDesc: string;
    postCtaButton: string;
    backToList: string;
  };
}

// ---------------------------------------------------------------------------
// Load content
// ---------------------------------------------------------------------------
function loadCollection<T>(name: string): T[] {
  const dir = join(__dirname, 'content', name);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as T);
}

function loadPage<T>(name: string): T {
  const filePath = join(__dirname, 'content', 'pages', `${name}.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

const services: Service[] = loadCollection<Service>('services');
const testimonials: Testimonial[] = loadCollection<Testimonial>('testimonials');
const posts: Post[] = loadCollection<Post>('posts').sort(
  (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
);

const homePage = loadPage<HomePage>('home');
const servicesPage = loadPage<ServicesPage>('services');
const contactPage = loadPage<ContactPage>('contact');
const blogPage = loadPage<BlogPage>('blog');

// Sort services: starter, growth (popular), enterprise by price
services.sort((a, b) => {
  const priceA = parseInt(a.data.price.replace(/[^0-9]/g, ''));
  const priceB = parseInt(b.data.price.replace(/[^0-9]/g, ''));
  return priceA - priceB;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Shared CSS
// ---------------------------------------------------------------------------
const css = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --accent: #2563eb;
  --accent-dark: #1d4ed8;
  --accent-light: #dbeafe;
  --dark: #111827;
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;
  --white: #ffffff;
  --font: 'DM Sans', system-ui, -apple-system, sans-serif;
  --max-w: 72rem;
  --radius: 0.75rem;
  --radius-lg: 1rem;
}

html { scroll-behavior: smooth; }

body {
  font-family: var(--font);
  background: var(--white);
  color: var(--dark);
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}

img { max-width: 100%; height: auto; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.container {
  max-width: var(--max-w);
  margin: 0 auto;
  padding: 0 1.5rem;
}

/* ---- Navigation ---- */
.nav {
  position: sticky;
  top: 0;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--gray-200);
  z-index: 100;
  padding: 0 1.5rem;
}
.nav-inner {
  max-width: var(--max-w);
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4rem;
}
.nav-brand {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--dark);
  text-decoration: none;
}
.nav-brand:hover { text-decoration: none; }
.nav-links {
  display: flex;
  align-items: center;
  gap: 2rem;
  list-style: none;
}
.nav-links a {
  color: var(--gray-600);
  font-size: 0.9375rem;
  font-weight: 500;
  text-decoration: none;
  transition: color 0.15s;
}
.nav-links a:hover { color: var(--dark); text-decoration: none; }
.nav-cta {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1.25rem;
  background: var(--accent);
  color: var(--white) !important;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 0.875rem;
  transition: background 0.15s;
}
.nav-cta:hover { background: var(--accent-dark); color: var(--white) !important; text-decoration: none; }

/* Mobile nav */
.nav-toggle { display: none; background: none; border: none; cursor: pointer; padding: 0.5rem; }
.nav-toggle svg { width: 24px; height: 24px; color: var(--dark); }

@media (max-width: 768px) {
  .nav-toggle { display: block; }
  .nav-links {
    display: none;
    position: absolute;
    top: 4rem;
    left: 0;
    right: 0;
    background: var(--white);
    flex-direction: column;
    padding: 1.5rem;
    gap: 1rem;
    border-bottom: 1px solid var(--gray-200);
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }
  .nav-links.open { display: flex; }
}

/* ---- Buttons ---- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.875rem 2rem;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  text-decoration: none;
  transition: all 0.15s;
  cursor: pointer;
  border: none;
}
.btn:hover { text-decoration: none; transform: translateY(-1px); }

.btn-primary {
  background: var(--accent);
  color: var(--white);
  box-shadow: 0 1px 3px rgba(37,99,235,0.3);
}
.btn-primary:hover { background: var(--accent-dark); box-shadow: 0 4px 12px rgba(37,99,235,0.3); }

.btn-outline {
  background: transparent;
  color: var(--dark);
  border: 2px solid var(--gray-300);
}
.btn-outline:hover { border-color: var(--accent); color: var(--accent); }

.btn-white {
  background: var(--white);
  color: var(--accent);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.btn-white:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

/* ---- Section helpers ---- */
.section-label {
  display: inline-block;
  text-transform: uppercase;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--accent);
  margin-bottom: 0.75rem;
}
.section-title {
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  font-weight: 700;
  line-height: 1.15;
  margin-bottom: 1rem;
  color: var(--dark);
}
.section-desc {
  max-width: 40rem;
  color: var(--gray-500);
  font-size: 1.125rem;
  margin-bottom: 3rem;
}
.text-center { text-align: center; }
.mx-auto { margin-left: auto; margin-right: auto; }

/* ---- Hero ---- */
.hero {
  position: relative;
  min-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, var(--gray-900) 0%, #1e3a5f 50%, var(--gray-900) 100%);
  color: var(--white);
}
.hero-bg {
  position: absolute;
  inset: 0;
  background-image: url('https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&h=900&fit=crop');
  background-size: cover;
  background-position: center;
  opacity: 0.15;
}
.hero-content {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 6rem 1.5rem;
  max-width: 48rem;
  margin: 0 auto;
}
.hero-name {
  font-size: clamp(2.5rem, 7vw, 4.5rem);
  font-weight: 700;
  line-height: 1.05;
  margin-bottom: 0.75rem;
}
.hero-title {
  font-size: clamp(1.125rem, 2.5vw, 1.5rem);
  font-weight: 500;
  color: rgba(255,255,255,0.8);
  margin-bottom: 1.5rem;
}
.hero-tagline {
  font-size: clamp(1rem, 2vw, 1.25rem);
  color: rgba(255,255,255,0.65);
  max-width: 36rem;
  margin: 0 auto 2.5rem;
  line-height: 1.7;
}
.hero-ctas {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

/* ---- Trust bar ---- */
.trust-bar {
  padding: 3rem 0;
  border-bottom: 1px solid var(--gray-200);
  text-align: center;
}
.trust-label {
  font-size: 0.875rem;
  color: var(--gray-400);
  font-weight: 500;
  margin-bottom: 1.5rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.trust-logos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3rem;
  flex-wrap: wrap;
}
.trust-logo {
  width: 120px;
  height: 32px;
  background: var(--gray-200);
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: var(--gray-400);
  font-weight: 600;
}

/* ---- Pricing cards ---- */
.pricing-section { padding: clamp(4rem, 8vw, 7rem) 0; }

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  align-items: start;
}

.pricing-card {
  background: var(--white);
  border: 2px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  position: relative;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.pricing-card:hover {
  box-shadow: 0 8px 30px rgba(0,0,0,0.08);
}
.pricing-card.popular {
  border-color: var(--accent);
  box-shadow: 0 8px 30px rgba(37,99,235,0.12);
  transform: scale(1.02);
}

.popular-badge {
  position: absolute;
  top: -0.875rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: var(--white);
  padding: 0.25rem 1rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.pricing-card h3 {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.pricing-price {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--dark);
  margin-bottom: 0.5rem;
}

.pricing-desc {
  color: var(--gray-500);
  font-size: 0.9375rem;
  margin-bottom: 2rem;
  line-height: 1.6;
}

.pricing-features {
  list-style: none;
  margin-bottom: 2rem;
}

.pricing-features li {
  padding: 0.5rem 0;
  font-size: 0.9375rem;
  color: var(--gray-700);
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.pricing-features li::before {
  content: '';
  width: 20px;
  height: 20px;
  min-width: 20px;
  background: var(--accent-light);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.15rem;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%232563eb'%3E%3Cpath fill-rule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clip-rule='evenodd'/%3E%3C/svg%3E");
  background-size: 14px;
  background-position: center;
  background-repeat: no-repeat;
}

.pricing-card .btn { width: 100%; }

@media (max-width: 900px) {
  .pricing-grid { grid-template-columns: 1fr; max-width: 28rem; margin-left: auto; margin-right: auto; }
  .pricing-card.popular { transform: none; }
}

/* ---- Testimonials ---- */
.testimonials-section {
  padding: clamp(4rem, 8vw, 7rem) 0;
  background: var(--gray-50);
}

.testimonials-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
}

.testimonial-card {
  background: var(--white);
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 2rem;
}

.testimonial-quote {
  font-size: 1rem;
  color: var(--gray-700);
  line-height: 1.7;
  margin-bottom: 1.5rem;
  position: relative;
  padding-left: 1.5rem;
  border-left: 3px solid var(--accent);
}

.testimonial-author {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.testimonial-photo {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.testimonial-name {
  font-weight: 700;
  font-size: 0.9375rem;
  color: var(--dark);
}

.testimonial-role {
  font-size: 0.8125rem;
  color: var(--gray-500);
}

@media (max-width: 768px) {
  .testimonials-grid { grid-template-columns: 1fr; }
}

/* ---- Blog cards ---- */
.blog-section { padding: clamp(4rem, 8vw, 7rem) 0; }

.blog-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}

.blog-card {
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: box-shadow 0.2s, transform 0.2s;
  background: var(--white);
  text-decoration: none;
  color: inherit;
  display: block;
}
.blog-card:hover {
  box-shadow: 0 8px 30px rgba(0,0,0,0.08);
  transform: translateY(-2px);
  text-decoration: none;
}

.blog-card-img {
  width: 100%;
  height: 200px;
  object-fit: cover;
}

.blog-card-body {
  padding: 1.5rem;
}

.blog-card-date {
  font-size: 0.8125rem;
  color: var(--gray-400);
  margin-bottom: 0.5rem;
}

.blog-card-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--dark);
  margin-bottom: 0.75rem;
  line-height: 1.35;
}

.blog-card-excerpt {
  font-size: 0.9375rem;
  color: var(--gray-500);
  line-height: 1.6;
}

@media (max-width: 900px) {
  .blog-grid { grid-template-columns: 1fr; max-width: 32rem; margin-left: auto; margin-right: auto; }
}

/* ---- CTA section ---- */
.cta-section {
  padding: clamp(4rem, 8vw, 6rem) 0;
  background: var(--accent);
  color: var(--white);
  text-align: center;
}
.cta-section h2 {
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  font-weight: 700;
  margin-bottom: 1rem;
  color: var(--white);
}
.cta-section p {
  font-size: 1.125rem;
  opacity: 0.9;
  margin-bottom: 2rem;
  max-width: 32rem;
  margin-left: auto;
  margin-right: auto;
}

/* ---- Contact page ---- */
.contact-section { padding: clamp(4rem, 8vw, 7rem) 0; }

.contact-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 4rem;
}

.contact-info h2 {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.contact-info p {
  color: var(--gray-500);
  margin-bottom: 2rem;
  line-height: 1.7;
}

.contact-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.contact-icon {
  width: 40px;
  height: 40px;
  background: var(--accent-light);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.contact-icon svg { width: 20px; height: 20px; color: var(--accent); }

.contact-item-label {
  font-size: 0.8125rem;
  color: var(--gray-400);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  margin-bottom: 0.125rem;
}

.contact-item-value {
  font-size: 1rem;
  color: var(--dark);
  font-weight: 500;
}

.contact-form {
  background: var(--gray-50);
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--dark);
  margin-bottom: 0.5rem;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--gray-300);
  border-radius: 0.5rem;
  font-family: var(--font);
  font-size: 1rem;
  color: var(--dark);
  background: var(--white);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
}

.form-textarea { min-height: 8rem; resize: vertical; }

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 768px) {
  .contact-grid { grid-template-columns: 1fr; }
  .form-row { grid-template-columns: 1fr; }
}

/* ---- Blog post ---- */
.post-header {
  padding: clamp(3rem, 6vw, 5rem) 0 2rem;
  text-align: center;
}
.post-header h1 {
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 1rem;
  max-width: 42rem;
  margin-left: auto;
  margin-right: auto;
}
.post-meta {
  color: var(--gray-400);
  font-size: 0.9375rem;
}
.post-cover {
  width: 100%;
  max-width: 48rem;
  margin: 2rem auto;
  display: block;
  border-radius: var(--radius-lg);
}
.post-body {
  max-width: 42rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
  font-size: 1.0625rem;
  line-height: 1.8;
  color: var(--gray-700);
}
.post-body h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--dark);
  margin: 2.5rem 0 1rem;
}
.post-body p {
  margin-bottom: 1.25rem;
}
.post-back {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--accent);
  font-weight: 500;
  margin-bottom: 2rem;
}

/* ---- Footer ---- */
.footer {
  border-top: 1px solid var(--gray-200);
  padding: 4rem 0 2rem;
  background: var(--gray-50);
}
.footer-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 3rem;
  margin-bottom: 3rem;
}
.footer-brand {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--dark);
  margin-bottom: 0.75rem;
}
.footer-desc {
  color: var(--gray-500);
  font-size: 0.9375rem;
  line-height: 1.6;
  max-width: 20rem;
}
.footer h4 {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--dark);
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.footer-links {
  list-style: none;
}
.footer-links li { margin-bottom: 0.5rem; }
.footer-links a {
  color: var(--gray-500);
  font-size: 0.9375rem;
  transition: color 0.15s;
}
.footer-links a:hover { color: var(--accent); text-decoration: none; }

.footer-bottom {
  border-top: 1px solid var(--gray-200);
  padding-top: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--gray-400);
  font-size: 0.875rem;
}
.footer-social {
  display: flex;
  gap: 1rem;
}
.footer-social a {
  color: var(--gray-400);
  transition: color 0.15s;
}
.footer-social a:hover { color: var(--accent); }

@media (max-width: 768px) {
  .footer-grid { grid-template-columns: 1fr 1fr; }
  .footer-bottom { flex-direction: column; gap: 1rem; }
}
`;

// SVG icons for social links
const socialSvg: Record<string, string> = {
  LinkedIn: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  Twitter: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
};

// SVG icons for contact items
const contactSvg: Record<string, string> = {
  Email: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>',
  Phone: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>',
  Location: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>',
};

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------
function nav(activePage: string = ''): string {
  const h = homePage.data;
  const navLinksHtml = h.navLinks
    .map(
      (link) =>
        `<li><a href="${esc(link.href)}"${activePage === link.key ? ' style="color: var(--dark); font-weight: 600;"' : ''}>${esc(link.label)}</a></li>`
    )
    .join('\n      ');

  return `
<nav class="nav">
  <div class="nav-inner">
    <a href="/" class="nav-brand">${esc(h.name)}</a>
    <button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')" aria-label="Toggle menu">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <ul class="nav-links">
      ${navLinksHtml}
      <li><a href="/contact/" class="nav-cta">${esc(h.navCta)}</a></li>
    </ul>
  </div>
</nav>`;
}

function footer(): string {
  const h = homePage.data;

  const columnsHtml = h.footerColumns
    .map(
      (col) => `
      <div>
        <h4>${esc(col.heading)}</h4>
        <ul class="footer-links">
          ${col.links.map((link) => `<li><a href="${esc(link.href)}">${esc(link.label)}</a></li>`).join('\n          ')}
        </ul>
      </div>`
    )
    .join('\n');

  const socialHtml = h.socialLinks
    .map(
      (link) =>
        `<a href="${esc(link.href)}" aria-label="${esc(link.label)}">${socialSvg[link.label] || ''}</a>`
    )
    .join('\n        ');

  return `
<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <div class="footer-brand">${esc(h.name)}</div>
        <p class="footer-desc">${esc(h.footerDesc)}</p>
      </div>
      ${columnsHtml}
    </div>
    <div class="footer-bottom">
      <span>&copy; ${new Date().getFullYear()} ${esc(h.name)}. ${esc(h.copyrightSuffix)} Built with <a href="https://webhouse.app">@webhouse/cms</a>.</span>
      <div class="footer-social">
        ${socialHtml}
      </div>
    </div>
  </div>
</footer>`;
}

function page(title: string, body: string, activePage: string = ''): string {
  const h = homePage.data;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — ${esc(h.name)}</title>
  <meta name="description" content="${esc(h.metaDescription)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
${nav(activePage)}
${body}
${footer()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page: Home
// ---------------------------------------------------------------------------
function buildHome(): string {
  const h = homePage.data;

  // Services preview
  const servicesHtml = services
    .map(
      (s) => `
      <div class="pricing-card${s.data.popular ? ' popular' : ''}">
        ${s.data.popular ? `<div class="popular-badge">${esc(servicesPage.data.popularBadge)}</div>` : ''}
        <h3>${esc(s.data.title)}</h3>
        <div class="pricing-price">${esc(s.data.price)}</div>
        <p class="pricing-desc">${esc(s.data.description)}</p>
        <ul class="pricing-features">
          ${s.data.features.map((f) => `<li>${esc(f.text)}</li>`).join('\n          ')}
        </ul>
        <a href="/services/" class="btn ${s.data.popular ? 'btn-primary' : 'btn-outline'}">${esc(servicesPage.data.cardButton)}</a>
      </div>`
    )
    .join('\n');

  // Testimonials
  const testimonialsHtml = testimonials
    .map(
      (t) => `
      <div class="testimonial-card">
        <p class="testimonial-quote">${esc(t.data.quote)}</p>
        <div class="testimonial-author">
          <img src="${esc(t.data.photo)}" alt="${esc(t.data.name)}" class="testimonial-photo" loading="lazy">
          <div>
            <div class="testimonial-name">${esc(t.data.name)}</div>
            <div class="testimonial-role">${esc(t.data.role)}, ${esc(t.data.company)}</div>
          </div>
        </div>
      </div>`
    )
    .join('\n');

  // Blog preview
  const blogHtml = posts
    .slice(0, 3)
    .map(
      (p) => `
      <a href="/blog/${esc(p.slug)}/" class="blog-card">
        <img src="${esc(p.data.coverImage)}" alt="" class="blog-card-img" loading="lazy">
        <div class="blog-card-body">
          <div class="blog-card-date">${formatDate(p.data.date)}</div>
          <h3 class="blog-card-title">${esc(p.data.title)}</h3>
          <p class="blog-card-excerpt">${esc(p.data.excerpt)}</p>
        </div>
      </a>`
    )
    .join('\n');

  const body = `
<!-- Hero -->
<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-content">
    <h1 class="hero-name">${esc(h.name)}</h1>
    <p class="hero-title">${esc(h.jobTitle)}</p>
    <p class="hero-tagline">${esc(h.heroTagline)}</p>
    <div class="hero-ctas">
      <a href="/contact/" class="btn btn-primary">${esc(h.heroCta1)}</a>
      <a href="/services/" class="btn btn-outline" style="color: var(--white); border-color: rgba(255,255,255,0.3);">${esc(h.heroCta2)}</a>
    </div>
  </div>
</section>

<!-- Trust bar -->
<section class="trust-bar">
  <div class="container">
    <div class="trust-label">${esc(h.trustLabel)}</div>
    <div class="trust-logos">
      ${h.trustCompanies.map((c) => `<div class="trust-logo">${esc(c)}</div>`).join('\n      ')}
    </div>
  </div>
</section>

<!-- Services / Pricing -->
<section class="pricing-section">
  <div class="container">
    <div class="text-center">
      <span class="section-label">${esc(h.servicesLabel)}</span>
      <h2 class="section-title">${esc(h.servicesTitle)}</h2>
      <p class="section-desc mx-auto">${esc(h.servicesDesc)}</p>
    </div>
    <div class="pricing-grid">
      ${servicesHtml}
    </div>
  </div>
</section>

<!-- Testimonials -->
<section class="testimonials-section">
  <div class="container">
    <div class="text-center">
      <span class="section-label">${esc(h.testimonialsLabel)}</span>
      <h2 class="section-title">${esc(h.testimonialsTitle)}</h2>
      <p class="section-desc mx-auto">${esc(h.testimonialsDesc)}</p>
    </div>
    <div class="testimonials-grid">
      ${testimonialsHtml}
    </div>
  </div>
</section>

<!-- Blog -->
<section class="blog-section">
  <div class="container">
    <div class="text-center">
      <span class="section-label">${esc(h.blogLabel)}</span>
      <h2 class="section-title">${esc(h.blogTitle)}</h2>
      <p class="section-desc mx-auto">${esc(h.blogDesc)}</p>
    </div>
    <div class="blog-grid">
      ${blogHtml}
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="container">
    <h2>${esc(h.ctaTitle)}</h2>
    <p>${esc(h.ctaDesc)}</p>
    <a href="/contact/" class="btn btn-white">${esc(h.ctaButton)}</a>
  </div>
</section>`;

  return page(h.title, body);
}

// ---------------------------------------------------------------------------
// Page: Services
// ---------------------------------------------------------------------------
function buildServices(): string {
  const s = servicesPage.data;

  const servicesHtml = services
    .map(
      (svc) => `
      <div class="pricing-card${svc.data.popular ? ' popular' : ''}">
        ${svc.data.popular ? `<div class="popular-badge">${esc(s.popularBadge)}</div>` : ''}
        <h3>${esc(svc.data.title)}</h3>
        <div class="pricing-price">${esc(svc.data.price)}</div>
        <p class="pricing-desc">${esc(svc.data.description)}</p>
        <ul class="pricing-features">
          ${svc.data.features.map((f) => `<li>${esc(f.text)}</li>`).join('\n          ')}
        </ul>
        <a href="/contact/" class="btn ${svc.data.popular ? 'btn-primary' : 'btn-outline'}">${esc(s.cardButton)}</a>
      </div>`
    )
    .join('\n');

  const body = `
<section class="pricing-section" style="padding-top: clamp(3rem, 6vw, 5rem);">
  <div class="container">
    <div class="text-center">
      <span class="section-label">${esc(s.pricingLabel)}</span>
      <h2 class="section-title">${esc(s.pricingTitle)}</h2>
      <p class="section-desc mx-auto">${esc(s.pricingDesc)}</p>
    </div>
    <div class="pricing-grid">
      ${servicesHtml}
    </div>
  </div>
</section>

<section class="cta-section">
  <div class="container">
    <h2>${esc(s.ctaTitle)}</h2>
    <p>${esc(s.ctaDesc)}</p>
    <a href="/contact/" class="btn btn-white">${esc(s.ctaButton)}</a>
  </div>
</section>`;

  return page(s.title, body, 'services');
}

// ---------------------------------------------------------------------------
// Page: Blog listing
// ---------------------------------------------------------------------------
function buildBlogIndex(): string {
  const b = blogPage.data;

  const blogHtml = posts
    .map(
      (p) => `
      <a href="/blog/${esc(p.slug)}/" class="blog-card">
        <img src="${esc(p.data.coverImage)}" alt="" class="blog-card-img" loading="lazy">
        <div class="blog-card-body">
          <div class="blog-card-date">${formatDate(p.data.date)}</div>
          <h3 class="blog-card-title">${esc(p.data.title)}</h3>
          <p class="blog-card-excerpt">${esc(p.data.excerpt)}</p>
        </div>
      </a>`
    )
    .join('\n');

  const body = `
<section class="blog-section" style="padding-top: clamp(3rem, 6vw, 5rem);">
  <div class="container">
    <div class="text-center">
      <span class="section-label">${esc(b.listingLabel)}</span>
      <h2 class="section-title">${esc(b.listingTitle)}</h2>
      <p class="section-desc mx-auto">${esc(b.listingDesc)}</p>
    </div>
    <div class="blog-grid">
      ${blogHtml}
    </div>
  </div>
</section>`;

  return page(b.title, body, 'blog');
}

// ---------------------------------------------------------------------------
// Page: Blog post
// ---------------------------------------------------------------------------
function buildBlogPost(post: Post): string {
  const h = homePage.data;
  const b = blogPage.data;

  const body = `
<section class="post-header">
  <div class="container">
    <a href="/blog/" class="post-back">&larr; ${esc(b.backToList)}</a>
    <h1>${esc(post.data.title)}</h1>
    <div class="post-meta">${formatDate(post.data.date)} &middot; ${esc(h.name)}</div>
  </div>
</section>
<img src="${esc(post.data.coverImage)}" alt="" class="post-cover" loading="lazy">
<article class="post-body">
  ${post.data.content}
</article>

<section class="cta-section">
  <div class="container">
    <h2>${esc(b.postCtaTitle)}</h2>
    <p>${esc(b.postCtaDesc)}</p>
    <a href="/contact/" class="btn btn-white">${esc(b.postCtaButton)}</a>
  </div>
</section>`;

  return page(post.data.title, body, 'blog');
}

// ---------------------------------------------------------------------------
// Page: Contact
// ---------------------------------------------------------------------------
function buildContact(): string {
  const c = contactPage.data;

  // Build form fields
  const rowFields = c.formFields.filter((f) => f.row);
  const standaloneFields = c.formFields.filter((f) => !f.row);

  // Group row fields by row number
  const rows = new Map<number, typeof c.formFields>();
  for (const field of rowFields) {
    const row = field.row!;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(field);
  }

  let formHtml = '';

  // Render row fields
  for (const [, fields] of rows) {
    formHtml += `
          <div class="form-row">
            ${fields
              .map(
                (f) => `<div class="form-group">
              <label class="form-label" for="${esc(f.id)}">${esc(f.label)}</label>
              <input type="${esc(f.type)}" id="${esc(f.id)}" class="form-input" placeholder="${esc(f.placeholder)}">
            </div>`
              )
              .join('\n            ')}
          </div>`;
  }

  // Render standalone fields
  for (const f of standaloneFields) {
    if (f.type === 'textarea') {
      formHtml += `
          <div class="form-group">
            <label class="form-label" for="${esc(f.id)}">${esc(f.label)}</label>
            <textarea id="${esc(f.id)}" class="form-textarea" placeholder="${esc(f.placeholder)}"></textarea>
          </div>`;
    } else {
      formHtml += `
          <div class="form-group">
            <label class="form-label" for="${esc(f.id)}">${esc(f.label)}</label>
            <input type="${esc(f.type)}" id="${esc(f.id)}" class="form-input" placeholder="${esc(f.placeholder)}">
          </div>`;
    }
  }

  const body = `
<section class="contact-section">
  <div class="container">
    <div class="contact-grid">
      <div class="contact-info">
        <span class="section-label">${esc(c.sectionLabel)}</span>
        <h2>${esc(c.heading)}</h2>
        <p>${esc(c.description)}</p>

        ${c.contactDetails
          .map(
            (item) => `<div class="contact-item">
          <div class="contact-icon">
            ${contactSvg[item.icon] || ''}
          </div>
          <div>
            <div class="contact-item-label">${esc(item.label)}</div>
            <div class="contact-item-value">${esc(item.value)}</div>
          </div>
        </div>`
          )
          .join('\n\n        ')}
      </div>

      <div class="contact-form">
        <form>
          ${formHtml}
          <button type="submit" class="btn btn-primary" style="width: 100%;">${esc(c.submitButton)}</button>
        </form>
      </div>
    </div>
  </div>
</section>`;

  return page(c.title, body, 'contact');
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------
const distDir = join(__dirname, 'dist');

function write(path: string, html: string): void {
  const fullPath = join(distDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, html, 'utf-8');
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`  ${path} (${kb} KB)`);
}

console.log('Building freelancer site...\n');

write('index.html', buildHome());
write('services/index.html', buildServices());
write('blog/index.html', buildBlogIndex());
write('contact/index.html', buildContact());

for (const post of posts) {
  write(`blog/${post.slug}/index.html`, buildBlogPost(post));
}

console.log(`\nDone! ${5 + posts.length - 2} pages built to dist/`);
