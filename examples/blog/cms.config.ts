import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
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
    filesystem: {
        "contentDir": "/Users/cb/Apps/webhouse/cms/examples/blog/content"
    },
  },
});
