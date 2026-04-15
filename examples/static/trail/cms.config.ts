import { defineConfig, defineCollection, defineBlock } from "@webhouse/cms";

/**
 * memx — Knowledge infrastructure landing site.
 *
 * 100% static. All content editable in CMS admin.
 * Hero, features, nav and footer are all driven by JSON content.
 */
export default defineConfig({
  blocks: [
    defineBlock({
      name: "hero",
      label: "Hero",
      fields: [
        { name: "eyebrow", type: "text", label: "Status badge", description: "Small text in pill (e.g. 'memx engine v2.0 is live')" },
        { name: "titleLine1", type: "text", label: "Title line 1", required: true },
        { name: "titleLine2", type: "text", label: "Title line 2 (amber accent)", description: "Renders with the gradient amber accent" },
        { name: "description", type: "textarea", label: "Description" },
        {
          name: "ctas",
          type: "array",
          label: "CTA buttons",
          fields: [
            { name: "label", type: "text", label: "Label" },
            { name: "href", type: "text", label: "URL" },
            {
              name: "variant",
              type: "select",
              label: "Style",
              options: [
                { value: "primary", label: "Primary (filled dark)" },
                { value: "secondary", label: "Secondary (outline mono)" },
              ],
            },
          ],
        },
        { name: "showScrollIndicator", type: "boolean", label: "Show scroll indicator" },
      ],
    }),
    defineBlock({
      name: "features",
      label: "Feature grid",
      fields: [
        { name: "title", type: "text", label: "Section title" },
        { name: "description", type: "textarea", label: "Section description" },
        {
          name: "items",
          type: "array",
          label: "Feature cards",
          fields: [
            {
              name: "icon",
              type: "select",
              label: "Icon",
              options: [
                { value: "graph", label: "Graph (semantic nodes)" },
                { value: "sync", label: "Globe / Sync" },
                { value: "search", label: "Search / Vector" },
                { value: "cube", label: "Cube / Ingestion" },
                { value: "code", label: "Code (API)" },
                { value: "lock", label: "Lock (encryption)" },
                { value: "spark", label: "Spark / Brain" },
                { value: "layers", label: "Layers" },
                { value: "atom", label: "Atom" },
              ],
            },
            { name: "title", type: "text", label: "Title" },
            { name: "description", type: "textarea", label: "Description" },
          ],
        },
      ],
    }),
  ],

  collections: [
    defineCollection({
      name: "global",
      label: "Global Settings",
      kind: "global",
      description:
        "Site-wide brand: logo, navigation, footer. Single record. Drives the navbar and footer everywhere.",
      fields: [
        { name: "siteTitle", type: "text", label: "Brand name", required: true },
        { name: "siteDescription", type: "textarea", label: "Default meta description" },
        { name: "logo", type: "image", label: "Logo (SVG/PNG)", description: "Shown in nav and footer (rendered at 32px)" },
        {
          name: "navLinks",
          type: "array",
          label: "Navigation links",
          fields: [
            { name: "label", type: "text", label: "Label" },
            { name: "href", type: "text", label: "URL" },
          ],
        },
        { name: "signInLabel", type: "text", label: "Sign in label" },
        { name: "signInHref", type: "text", label: "Sign in URL" },
        { name: "navCtaLabel", type: "text", label: "Nav CTA label" },
        { name: "navCtaHref", type: "text", label: "Nav CTA URL" },
        {
          name: "footerLinks",
          type: "array",
          label: "Footer links",
          fields: [
            { name: "label", type: "text", label: "Label" },
            { name: "href", type: "text", label: "URL" },
          ],
        },
        { name: "footerCopyright", type: "text", label: "Footer copyright" },
        { name: "footerTagline", type: "text", label: "Footer tagline", description: "e.g. 'As we may think.'" },
      ],
    }),
    defineCollection({
      name: "pages",
      label: "Pages",
      urlPrefix: "/",
      kind: "page",
      description:
        "Landing pages and long-form essays. Page with slug 'home' becomes the homepage. Pages can use block-based sections (hero/features) and/or richtext content.",
      fields: [
        { name: "title", type: "text", label: "Title", required: true },
        { name: "metaDescription", type: "textarea", label: "Meta description" },
        { name: "excerpt", type: "textarea", label: "Excerpt", description: "Short summary used for meta + article header" },
        { name: "coverImage", type: "image", label: "Cover image" },
        { name: "date", type: "date", label: "Date" },
        { name: "author", type: "text", label: "Author" },
        { name: "category", type: "text", label: "Category", description: "Editorial grouping (e.g. 'The 1945 Concept')" },
        { name: "tags", type: "tags", label: "Tags" },
        {
          name: "sections",
          type: "blocks",
          label: "Sections",
          blocks: ["hero", "features"],
        },
        { name: "content", type: "richtext", label: "Content", description: "Long-form body. Supports markdown + inline HTML (figures, SVG)." },
        { name: "relatedPosts", type: "relation", label: "Related posts", collection: "posts" },
        { name: "relatedPages", type: "relation", label: "Related pages", collection: "pages" },
      ],
    }),
    defineCollection({
      name: "posts",
      label: "Posts",
      urlPrefix: "/blog",
      kind: "page",
      description:
        "Blog posts and essays. Organized by category, tagged for discovery, linked to related content.",
      fields: [
        { name: "title", type: "text", label: "Title", required: true },
        { name: "excerpt", type: "textarea", label: "Excerpt" },
        { name: "content", type: "richtext", label: "Content" },
        { name: "date", type: "date", label: "Publish date" },
        { name: "author", type: "text", label: "Author" },
        { name: "coverImage", type: "image", label: "Cover image" },
        {
          name: "category",
          type: "select",
          label: "Category",
          options: [
            { value: "the-1945-concept", label: "The 1945 Concept" },
            { value: "engineering", label: "Engineering" },
            { value: "research", label: "Research" },
            { value: "product", label: "Product" },
            { value: "announcements", label: "Announcements" },
          ],
        },
        { name: "tags", type: "tags", label: "Tags" },
        { name: "readTime", type: "text", label: "Read time", description: "e.g. \"6 min read\"" },
        { name: "attribution", type: "textarea", label: "Attribution / source note" },
        { name: "relatedPosts", type: "relation", label: "Related posts", collection: "posts" },
        { name: "relatedPages", type: "relation", label: "Related pages", collection: "pages" },
      ],
    }),
  ],

  storage: {
    adapter: "filesystem",
    filesystem: { contentDir: "content" },
  },
  build: {
    outDir: "dist",
    baseUrl: "/",
  },
});
