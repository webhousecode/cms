/**
 * F97 Phase 4 — JSON-LD Structured Data Templates
 *
 * Pre-built templates for common schema.org types.
 * Templates use {{field}} placeholders interpolated from document data.
 */

export interface JsonLdTemplate {
  id: string;
  label: string;
  description: string;
  fields: JsonLdFieldDef[];
  generate: (values: Record<string, string>) => Record<string, unknown>;
}

export interface JsonLdFieldDef {
  key: string;
  label: string;
  placeholder: string;
  /** Auto-fill from document data key (e.g. "title", "date", "slug") */
  autoFrom?: string;
  required?: boolean;
  /** Hidden fields are auto-filled from SEO/doc data but not shown in UI */
  hidden?: boolean;
}

export const JSON_LD_TEMPLATES: JsonLdTemplate[] = [
  {
    id: "article",
    label: "Article",
    description: "Blog post or news article",
    fields: [
      { key: "headline", label: "Headline", placeholder: "Article title", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "Description", placeholder: "Short summary", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "datePublished", label: "Published", placeholder: "2026-01-15", autoFrom: "date" },
      { key: "dateModified", label: "Modified", placeholder: "2026-01-20", autoFrom: "updatedAt" },
      { key: "authorName", label: "Author", placeholder: "Author name", autoFrom: "author" },
      { key: "image", label: "Image URL", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: v.headline || undefined,
      description: v.description || undefined,
      datePublished: v.datePublished || undefined,
      dateModified: v.dateModified || undefined,
      author: v.authorName ? { "@type": "Person", name: v.authorName } : undefined,
      image: v.image || undefined,
    }),
  },
  {
    id: "faq",
    label: "FAQ",
    description: "Frequently asked questions",
    fields: [
      { key: "headline", label: "Page title", placeholder: "FAQ page title", autoFrom: "title", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      name: v.headline || undefined,
      mainEntity: [],
    }),
  },
  {
    id: "product",
    label: "Product",
    description: "Product listing with price",
    fields: [
      { key: "name", label: "Product name", placeholder: "Product title", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "Description", placeholder: "Product description", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "image", label: "Image URL", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
      { key: "price", label: "Price", placeholder: "99.00" },
      { key: "currency", label: "Currency", placeholder: "DKK" },
      { key: "availability", label: "Availability", placeholder: "InStock" },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Product",
      name: v.name || undefined,
      description: v.description || undefined,
      image: v.image || undefined,
      offers: (v.price || v.availability) ? {
        "@type": "Offer",
        price: v.price || undefined,
        priceCurrency: v.currency || undefined,
        availability: v.availability ? `https://schema.org/${v.availability}` : undefined,
      } : undefined,
    }),
  },
  {
    id: "event",
    label: "Event",
    description: "Event with date and location",
    fields: [
      { key: "name", label: "Event name", placeholder: "Event title", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "Description", placeholder: "Event description", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "startDate", label: "Start date", placeholder: "2026-06-15T19:00", autoFrom: "date" },
      { key: "endDate", label: "End date", placeholder: "2026-06-15T22:00" },
      { key: "locationName", label: "Venue", placeholder: "Venue name" },
      { key: "locationAddress", label: "Address", placeholder: "Street, City" },
      { key: "image", label: "Image URL", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Event",
      name: v.name || undefined,
      description: v.description || undefined,
      startDate: v.startDate || undefined,
      endDate: v.endDate || undefined,
      location: v.locationName ? {
        "@type": "Place",
        name: v.locationName,
        address: v.locationAddress || undefined,
      } : undefined,
      image: v.image || undefined,
    }),
  },
  {
    id: "person",
    label: "Person",
    description: "Person profile page",
    fields: [
      { key: "name", label: "Name", placeholder: "Full name", autoFrom: "title", required: true, hidden: true },
      { key: "jobTitle", label: "Job title", placeholder: "Software Engineer" },
      { key: "description", label: "Description", placeholder: "Bio", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "image", label: "Image URL", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
      { key: "url", label: "Website", placeholder: "https://..." },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Person",
      name: v.name || undefined,
      jobTitle: v.jobTitle || undefined,
      description: v.description || undefined,
      image: v.image || undefined,
      url: v.url || undefined,
    }),
  },
  {
    id: "organization",
    label: "Organization",
    description: "Company or organization",
    fields: [
      { key: "name", label: "Name", placeholder: "Organization name", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "Description", placeholder: "About", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "url", label: "Website", placeholder: "https://..." },
      { key: "logo", label: "Logo URL", placeholder: "/uploads/logo.png" },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: v.name || undefined,
      description: v.description || undefined,
      url: v.url || undefined,
      logo: v.logo || undefined,
    }),
  },
  {
    id: "local-business",
    label: "Local Business",
    description: "Local business with address",
    fields: [
      { key: "name", label: "Business name", placeholder: "Business name", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "Description", placeholder: "About", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "streetAddress", label: "Street", placeholder: "123 Main St" },
      { key: "city", label: "City", placeholder: "Aalborg" },
      { key: "postalCode", label: "Postal code", placeholder: "9000" },
      { key: "country", label: "Country", placeholder: "DK" },
      { key: "phone", label: "Phone", placeholder: "+45..." },
      { key: "image", label: "Image URL", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: v.name || undefined,
      description: v.description || undefined,
      address: (v.streetAddress || v.city) ? {
        "@type": "PostalAddress",
        streetAddress: v.streetAddress || undefined,
        addressLocality: v.city || undefined,
        postalCode: v.postalCode || undefined,
        addressCountry: v.country || undefined,
      } : undefined,
      telephone: v.phone || undefined,
      image: v.image || undefined,
    }),
  },
  // ── F112 G04 — New templates ─────────────────────────────
  {
    id: "howto",
    label: "HowTo",
    description: "Step-by-step guide or tutorial",
    fields: [
      { key: "name", label: "Guide title", placeholder: "How to...", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "Description", placeholder: "What this guide teaches", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "totalTime", label: "Total time", placeholder: "PT30M (30 min)" },
      { key: "image", label: "Image URL", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: v.name || undefined,
      description: v.description || undefined,
      totalTime: v.totalTime || undefined,
      image: v.image || undefined,
    }),
  },
  {
    id: "service",
    label: "Service",
    description: "Professional service offering",
    fields: [
      { key: "name", label: "Service name", placeholder: "Web Development", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "Description", placeholder: "What the service includes", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "provider", label: "Provider name", placeholder: "Company name" },
      { key: "areaServed", label: "Area served", placeholder: "Denmark" },
      { key: "image", label: "Image URL", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Service",
      name: v.name || undefined,
      description: v.description || undefined,
      provider: v.provider ? { "@type": "Organization", name: v.provider } : undefined,
      areaServed: v.areaServed || undefined,
      image: v.image || undefined,
    }),
  },
  {
    id: "software",
    label: "Software",
    description: "Software application or SaaS product",
    fields: [
      { key: "name", label: "App name", placeholder: "App name", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "Description", placeholder: "What the app does", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "applicationCategory", label: "Category", placeholder: "DeveloperApplication" },
      { key: "operatingSystem", label: "OS", placeholder: "Web, macOS, Windows" },
      { key: "price", label: "Price", placeholder: "0 (free) or 29.00" },
      { key: "currency", label: "Currency", placeholder: "USD" },
      { key: "image", label: "Image URL", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: v.name || undefined,
      description: v.description || undefined,
      applicationCategory: v.applicationCategory || undefined,
      operatingSystem: v.operatingSystem || undefined,
      offers: v.price !== undefined ? {
        "@type": "Offer",
        price: v.price,
        priceCurrency: v.currency || "USD",
      } : undefined,
      image: v.image || undefined,
    }),
  },
  {
    id: "breadcrumb",
    label: "Breadcrumb",
    description: "Navigation breadcrumb trail (auto-generated from URL)",
    fields: [
      { key: "item1Name", label: "Level 1", placeholder: "Home", autoFrom: "_breadcrumb.1" },
      { key: "item1Url", label: "Level 1 URL", placeholder: "/", autoFrom: "_breadcrumb.1url" },
      { key: "item2Name", label: "Level 2", placeholder: "Blog", autoFrom: "_breadcrumb.2" },
      { key: "item2Url", label: "Level 2 URL", placeholder: "/posts/", autoFrom: "_breadcrumb.2url" },
      { key: "item3Name", label: "Level 3 (current)", placeholder: "Article title", autoFrom: "title" },
    ],
    generate: (v) => {
      const items: Record<string, unknown>[] = [];
      if (v.item1Name) items.push({ "@type": "ListItem", position: 1, name: v.item1Name, item: v.item1Url || undefined });
      if (v.item2Name) items.push({ "@type": "ListItem", position: 2, name: v.item2Name, item: v.item2Url || undefined });
      if (v.item3Name) items.push({ "@type": "ListItem", position: items.length + 1, name: v.item3Name });
      return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items,
      };
    },
  },
  {
    id: "website",
    label: "WebSite",
    description: "Site-level schema with search action (use on homepage)",
    fields: [
      { key: "name", label: "Site name", placeholder: "My Website", autoFrom: "title", required: true },
      { key: "url", label: "Site URL", placeholder: "https://example.com" },
      { key: "description", label: "Description", placeholder: "Site description", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "searchUrl", label: "Search URL template", placeholder: "https://example.com/search?q={search_term}" },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: v.name || undefined,
      url: v.url || undefined,
      description: v.description || undefined,
      potentialAction: v.searchUrl ? {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: v.searchUrl },
        "query-input": "required name=search_term",
      } : undefined,
    }),
  },
];

/**
 * Resolve a dotted path (e.g. "_seo.ogImage") from document data.
 */
function resolveField(data: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  return current != null ? String(current) : "";
}

/**
 * Auto-fill template fields from document data.
 */
export function autoFillFields(
  template: JsonLdTemplate,
  docData: Record<string, unknown>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    if (field.autoFrom) {
      const val = resolveField(docData, field.autoFrom);
      if (val) values[field.key] = val;
    }
  }
  return values;
}

/**
 * Generate clean JSON-LD (removes undefined values).
 */
export function generateJsonLd(
  template: JsonLdTemplate,
  values: Record<string, string>,
  locale?: string,
): Record<string, unknown> {
  const raw = template.generate(values);
  const result: Record<string, unknown> = JSON.parse(JSON.stringify(raw)); // strips undefined
  if (locale) {
    result["inLanguage"] = locale;
  }
  return result;
}
