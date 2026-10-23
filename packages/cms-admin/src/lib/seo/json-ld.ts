/**
 * F97 Phase 4 — JSON-LD Structured Data Templates
 *
 * Pre-built templates for common schema.org types.
 * Templates use {{field}} placeholders interpolated from document data.
 */

export interface JsonLdTemplate {
  id: string;
  /** i18n key (libText.jsonLd.*) — render with t() */
  label: string;
  /** i18n key — render with t() */
  description: string;
  fields: JsonLdFieldDef[];
  generate: (values: Record<string, string>) => Record<string, unknown>;
}

export interface JsonLdFieldDef {
  key: string;
  /** i18n key — render with t() */
  label: string;
  /** i18n key for prose placeholders, literal example value otherwise — render with t() (unknown keys pass through) */
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
    label: "libText.jsonLd.article.label",
    description: "libText.jsonLd.article.description",
    fields: [
      { key: "headline", label: "libText.jsonLd.article.fields.headline.label", placeholder: "libText.jsonLd.article.fields.headline.placeholder", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "libText.jsonLd.article.fields.description.label", placeholder: "libText.jsonLd.article.fields.description.placeholder", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "datePublished", label: "libText.jsonLd.article.fields.datePublished.label", placeholder: "2026-01-15", autoFrom: "date" },
      { key: "dateModified", label: "libText.jsonLd.article.fields.dateModified.label", placeholder: "2026-01-20", autoFrom: "updatedAt" },
      { key: "authorName", label: "libText.jsonLd.article.fields.authorName.label", placeholder: "libText.jsonLd.article.fields.authorName.placeholder", autoFrom: "author" },
      { key: "image", label: "libText.jsonLd.article.fields.image.label", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Article", // i18n-ignore: schema.org type / JSON-LD value, not UI text
      headline: v.headline || undefined,
      description: v.description || undefined,
      datePublished: v.datePublished || undefined,
      dateModified: v.dateModified || undefined,
      author: v.authorName ? { "@type": "Person", name: v.authorName } : undefined, // i18n-ignore: schema.org type / JSON-LD value, not UI text
      image: v.image || undefined,
    }),
  },
  {
    id: "faq",
    label: "libText.jsonLd.faq.label",
    description: "libText.jsonLd.faq.description",
    fields: [
      { key: "headline", label: "libText.jsonLd.faq.fields.headline.label", placeholder: "libText.jsonLd.faq.fields.headline.placeholder", autoFrom: "title", hidden: true },
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
    label: "libText.jsonLd.product.label",
    description: "libText.jsonLd.product.description",
    fields: [
      { key: "name", label: "libText.jsonLd.product.fields.name.label", placeholder: "libText.jsonLd.product.fields.name.placeholder", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "libText.jsonLd.product.fields.description.label", placeholder: "libText.jsonLd.product.fields.description.placeholder", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "image", label: "libText.jsonLd.product.fields.image.label", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
      { key: "price", label: "libText.jsonLd.product.fields.price.label", placeholder: "99.00" },
      { key: "currency", label: "libText.jsonLd.product.fields.currency.label", placeholder: "DKK" },
      { key: "availability", label: "libText.jsonLd.product.fields.availability.label", placeholder: "InStock" },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Product", // i18n-ignore: schema.org type / JSON-LD value, not UI text
      name: v.name || undefined,
      description: v.description || undefined,
      image: v.image || undefined,
      offers: (v.price || v.availability) ? {
        "@type": "Offer", // i18n-ignore: schema.org type / JSON-LD value, not UI text
        price: v.price || undefined,
        priceCurrency: v.currency || undefined,
        availability: v.availability ? `https://schema.org/${v.availability}` : undefined,
      } : undefined,
    }),
  },
  {
    id: "event",
    label: "libText.jsonLd.event.label",
    description: "libText.jsonLd.event.description",
    fields: [
      { key: "name", label: "libText.jsonLd.event.fields.name.label", placeholder: "libText.jsonLd.event.fields.name.placeholder", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "libText.jsonLd.event.fields.description.label", placeholder: "libText.jsonLd.event.fields.description.placeholder", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "startDate", label: "libText.jsonLd.event.fields.startDate.label", placeholder: "2026-06-15T19:00", autoFrom: "date" },
      { key: "endDate", label: "libText.jsonLd.event.fields.endDate.label", placeholder: "2026-06-15T22:00" },
      { key: "locationName", label: "libText.jsonLd.event.fields.locationName.label", placeholder: "libText.jsonLd.event.fields.locationName.placeholder" },
      { key: "locationAddress", label: "libText.jsonLd.event.fields.locationAddress.label", placeholder: "libText.jsonLd.event.fields.locationAddress.placeholder" },
      { key: "image", label: "libText.jsonLd.event.fields.image.label", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Event", // i18n-ignore: schema.org type / JSON-LD value, not UI text
      name: v.name || undefined,
      description: v.description || undefined,
      startDate: v.startDate || undefined,
      endDate: v.endDate || undefined,
      location: v.locationName ? {
        "@type": "Place", // i18n-ignore: schema.org type / JSON-LD value, not UI text
        name: v.locationName,
        address: v.locationAddress || undefined,
      } : undefined,
      image: v.image || undefined,
    }),
  },
  {
    id: "person",
    label: "libText.jsonLd.person.label",
    description: "libText.jsonLd.person.description",
    fields: [
      { key: "name", label: "libText.jsonLd.person.fields.name.label", placeholder: "libText.jsonLd.person.fields.name.placeholder", autoFrom: "title", required: true, hidden: true },
      { key: "jobTitle", label: "libText.jsonLd.person.fields.jobTitle.label", placeholder: "libText.jsonLd.person.fields.jobTitle.placeholder" },
      { key: "description", label: "libText.jsonLd.person.fields.description.label", placeholder: "libText.jsonLd.person.fields.description.placeholder", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "image", label: "libText.jsonLd.person.fields.image.label", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
      { key: "url", label: "libText.jsonLd.person.fields.url.label", placeholder: "https://..." },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Person", // i18n-ignore: schema.org type / JSON-LD value, not UI text
      name: v.name || undefined,
      jobTitle: v.jobTitle || undefined,
      description: v.description || undefined,
      image: v.image || undefined,
      url: v.url || undefined,
    }),
  },
  {
    id: "organization",
    label: "libText.jsonLd.organization.label",
    description: "libText.jsonLd.organization.description",
    fields: [
      { key: "name", label: "libText.jsonLd.organization.fields.name.label", placeholder: "libText.jsonLd.organization.fields.name.placeholder", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "libText.jsonLd.organization.fields.description.label", placeholder: "libText.jsonLd.organization.fields.description.placeholder", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "url", label: "libText.jsonLd.organization.fields.url.label", placeholder: "https://..." },
      { key: "logo", label: "libText.jsonLd.organization.fields.logo.label", placeholder: "/uploads/logo.png" },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Organization", // i18n-ignore: schema.org type / JSON-LD value, not UI text
      name: v.name || undefined,
      description: v.description || undefined,
      url: v.url || undefined,
      logo: v.logo || undefined,
    }),
  },
  {
    id: "local-business",
    label: "libText.jsonLd.localBusiness.label",
    description: "libText.jsonLd.localBusiness.description",
    fields: [
      { key: "name", label: "libText.jsonLd.localBusiness.fields.name.label", placeholder: "libText.jsonLd.localBusiness.fields.name.placeholder", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "libText.jsonLd.localBusiness.fields.description.label", placeholder: "libText.jsonLd.localBusiness.fields.description.placeholder", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "streetAddress", label: "libText.jsonLd.localBusiness.fields.streetAddress.label", placeholder: "libText.jsonLd.localBusiness.fields.streetAddress.placeholder" },
      { key: "city", label: "libText.jsonLd.localBusiness.fields.city.label", placeholder: "libText.jsonLd.localBusiness.fields.city.placeholder" },
      { key: "postalCode", label: "libText.jsonLd.localBusiness.fields.postalCode.label", placeholder: "9000" },
      { key: "country", label: "libText.jsonLd.localBusiness.fields.country.label", placeholder: "DK" },
      { key: "phone", label: "libText.jsonLd.localBusiness.fields.phone.label", placeholder: "+45..." },
      { key: "image", label: "libText.jsonLd.localBusiness.fields.image.label", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
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
    label: "libText.jsonLd.howto.label",
    description: "libText.jsonLd.howto.description",
    fields: [
      { key: "name", label: "libText.jsonLd.howto.fields.name.label", placeholder: "libText.jsonLd.howto.fields.name.placeholder", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "libText.jsonLd.howto.fields.description.label", placeholder: "libText.jsonLd.howto.fields.description.placeholder", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "totalTime", label: "libText.jsonLd.howto.fields.totalTime.label", placeholder: "libText.jsonLd.howto.fields.totalTime.placeholder" },
      { key: "image", label: "libText.jsonLd.howto.fields.image.label", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
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
    label: "libText.jsonLd.service.label",
    description: "libText.jsonLd.service.description",
    fields: [
      { key: "name", label: "libText.jsonLd.service.fields.name.label", placeholder: "libText.jsonLd.service.fields.name.placeholder", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "libText.jsonLd.service.fields.description.label", placeholder: "libText.jsonLd.service.fields.description.placeholder", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "provider", label: "libText.jsonLd.service.fields.provider.label", placeholder: "libText.jsonLd.service.fields.provider.placeholder" },
      { key: "areaServed", label: "libText.jsonLd.service.fields.areaServed.label", placeholder: "libText.jsonLd.service.fields.areaServed.placeholder" },
      { key: "image", label: "libText.jsonLd.service.fields.image.label", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "Service", // i18n-ignore: schema.org type / JSON-LD value, not UI text
      name: v.name || undefined,
      description: v.description || undefined,
      provider: v.provider ? { "@type": "Organization", name: v.provider } : undefined,
      areaServed: v.areaServed || undefined,
      image: v.image || undefined,
    }),
  },
  {
    id: "software",
    label: "libText.jsonLd.software.label",
    description: "libText.jsonLd.software.description",
    fields: [
      { key: "name", label: "libText.jsonLd.software.fields.name.label", placeholder: "libText.jsonLd.software.fields.name.placeholder", autoFrom: "title", required: true, hidden: true },
      { key: "description", label: "libText.jsonLd.software.fields.description.label", placeholder: "libText.jsonLd.software.fields.description.placeholder", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "applicationCategory", label: "libText.jsonLd.software.fields.applicationCategory.label", placeholder: "DeveloperApplication" },
      { key: "operatingSystem", label: "libText.jsonLd.software.fields.operatingSystem.label", placeholder: "libText.jsonLd.software.fields.operatingSystem.placeholder" },
      { key: "price", label: "libText.jsonLd.software.fields.price.label", placeholder: "libText.jsonLd.software.fields.price.placeholder" },
      { key: "currency", label: "libText.jsonLd.software.fields.currency.label", placeholder: "USD" },
      { key: "image", label: "libText.jsonLd.software.fields.image.label", placeholder: "/uploads/...", autoFrom: "_seo.ogImage", hidden: true },
    ],
    generate: (v) => ({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: v.name || undefined,
      description: v.description || undefined,
      applicationCategory: v.applicationCategory || undefined,
      operatingSystem: v.operatingSystem || undefined,
      offers: v.price !== undefined ? {
        "@type": "Offer", // i18n-ignore: schema.org type / JSON-LD value, not UI text
        price: v.price,
        priceCurrency: v.currency || "USD",
      } : undefined,
      image: v.image || undefined,
    }),
  },
  {
    id: "breadcrumb",
    label: "libText.jsonLd.breadcrumb.label",
    description: "libText.jsonLd.breadcrumb.description",
    fields: [
      { key: "item1Name", label: "libText.jsonLd.breadcrumb.fields.item1Name.label", placeholder: "libText.jsonLd.breadcrumb.fields.item1Name.placeholder", autoFrom: "_breadcrumb.1" },
      { key: "item1Url", label: "libText.jsonLd.breadcrumb.fields.item1Url.label", placeholder: "/", autoFrom: "_breadcrumb.1url" },
      { key: "item2Name", label: "libText.jsonLd.breadcrumb.fields.item2Name.label", placeholder: "libText.jsonLd.breadcrumb.fields.item2Name.placeholder", autoFrom: "_breadcrumb.2" },
      { key: "item2Url", label: "libText.jsonLd.breadcrumb.fields.item2Url.label", placeholder: "/posts/", autoFrom: "_breadcrumb.2url" },
      { key: "item3Name", label: "libText.jsonLd.breadcrumb.fields.item3Name.label", placeholder: "libText.jsonLd.breadcrumb.fields.item3Name.placeholder", autoFrom: "title" },
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
    label: "libText.jsonLd.website.label",
    description: "libText.jsonLd.website.description",
    fields: [
      { key: "name", label: "libText.jsonLd.website.fields.name.label", placeholder: "libText.jsonLd.website.fields.name.placeholder", autoFrom: "title", required: true },
      { key: "url", label: "libText.jsonLd.website.fields.url.label", placeholder: "https://example.com" },
      { key: "description", label: "libText.jsonLd.website.fields.description.label", placeholder: "libText.jsonLd.website.fields.description.placeholder", autoFrom: "_seo.metaDescription", hidden: true },
      { key: "searchUrl", label: "libText.jsonLd.website.fields.searchUrl.label", placeholder: "https://example.com/search?q={search_term}" },
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
        "query-input": "required name=search_term", // i18n-ignore: schema.org type / JSON-LD value, not UI text
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
