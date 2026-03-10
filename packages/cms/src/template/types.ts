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
  };
  page: {
    title: string;
    slug?: string;
    collection?: string;
    description?: string;
    canonicalUrl?: string;
    ogImage?: string;
    jsonLd?: Record<string, unknown>;
  };
}

export interface BlockRenderer {
  name: string;
  render(data: Record<string, unknown>, context: TemplateContext): string;
}

export type PageTemplate = (content: string, context: TemplateContext) => string;
export type LayoutTemplate = (content: string, context: TemplateContext) => string;
