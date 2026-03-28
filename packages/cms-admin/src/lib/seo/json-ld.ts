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
): Record<string, unknown> {
  const raw = template.generate(values);
  return JSON.parse(JSON.stringify(raw)); // strips undefined
}
