export interface NavItem {
  label: string;
  href: string;
}

export interface TemplateContext {
  site: {
    title: string;
    baseUrl: string;
    description?: string;
    nav?: NavItem[];
    /** Default locale for the site */
    lang?: string;
  };
  page: {
    title: string;
    slug?: string;
    collection?: string;
    description?: string;
    canonicalUrl?: string;
    ogImage?: string;
    jsonLd?: Record<string, unknown>;
    /** BCP 47 locale for this specific page, overrides site.lang */
    lang?: string;
    /** hreflang alternates: { locale → absolute URL } */
    alternates?: Record<string, string>;
  };
}

export interface BlockRenderer {
  name: string;
  render(data: Record<string, unknown>, context: TemplateContext): string;
}

export type PageTemplate = (content: string, context: TemplateContext) => string;
export type LayoutTemplate = (content: string, context: TemplateContext) => string;
