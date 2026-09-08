import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  // F193.2 — fixturen HAR tosproget indhold (content/posts/scenario-1-da.json
  // + scenario-1-en.json, siden april). Kun deklarationen manglede, og uden den
  // renderer sprogfilteret aldrig — så otte E2E-prøver har stået røde i over
  // 100 kørsler på en flade der er rigtig.
  //
  // Diagnosen er skrevet TO gange før (F178.5, F178.7) og rettelsen landede
  // aldrig. Derfor er den her nu, og derfor spærrer F193.3 udrulningen på E2E:
  // en rød prøve ingen kan mærke bliver rettet en tredje gang for sent.
  locales: ["da", "en"],
  defaultLocale: "da",
  collections: [
    defineCollection({
      name: "posts",
      label: "Blog Posts",
      fields: [
        { name: "title", type: "text", label: "Title", required: true },
        { name: "excerpt", type: "textarea", label: "Excerpt" },
        { name: "content", type: "richtext", label: "Content" },
        { name: "date", type: "date", label: "Publish Date" },
        { name: "author", type: "text", label: "Author" },
      ],
    }),
    defineCollection({
      name: "pages",
      label: "Pages",
      urlPrefix: "/",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "content", type: "richtext" },
      ],
    }),
    defineCollection({
      name: "team",
      label: "Team Members",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "role", type: "text" },
        { name: "bio", type: "textarea" },
        { name: "photo", type: "image" },
        { name: "email", type: "text" },
        { name: "sortOrder", type: "number" },
      ],
    }),
    defineCollection({
      name: "services",
      label: "Services",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "description", type: "textarea" },
        { name: "price", type: "text" },
        { name: "icon", type: "text", label: "Icon (emoji)" },
        { name: "sortOrder", type: "number" },
      ],
    }),
    defineCollection({
      name: "testimonials",
      label: "Testimonials",
      fields: [
        { name: "quote", type: "textarea", required: true },
        { name: "author", type: "text", required: true },
        { name: "role", type: "text" },
        { name: "company", type: "text" },
        { name: "rating", type: "number" },
      ],
    }),
    defineCollection({
      name: "snippets",
      label: "Snippets",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "content", type: "richtext", required: true },
      ],
    }),
    defineCollection({
      name: "contact-submissions",
      label: "Contact Form",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "email", type: "text", required: true },
        { name: "subject", type: "text" },
        { name: "message", type: "textarea", required: true },
        { name: "submittedAt", type: "date" },
      ],
    }),
    defineCollection({
      name: "bookmarks",
      label: "Bookmarks",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "url", type: "text", label: "URL" },
        { name: "links", type: "array", label: "Related Links" },
      ],
    }),
    defineCollection({
      name: "globals",
      label: "Globals",
      fields: [
        { name: "siteTitle", type: "text", required: true },
        { name: "siteDescription", type: "textarea" },
        { name: "footerText", type: "text" },
        { name: "twitterHandle", type: "text" },
        { name: "githubUrl", type: "text" },
        { name: "analyticsId", type: "text" },
      ],
    })
  ],
  storage: {
    adapter: "filesystem",
    filesystem: { contentDir: "content" },
  },
});
