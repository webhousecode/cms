import { defineConfig, defineCollection } from "@webhouse/cms";

/**
 * Lens fixture site — a deterministic local-only tenant used by the Lens
 * visual-regression manifest (lens.manifest.json) so admin surfaces have
 * stable, predictable content to render and capture. Registered locally as
 * site slug `lens-fixture-site` (org `lens`). Not a real customer site.
 */
export default defineConfig({
  collections: [
    defineCollection({
      name: "posts",
      label: "Posts",
      fields: [
        { name: "title", type: "text", label: "Title", required: true },
        { name: "excerpt", type: "textarea", label: "Excerpt" },
        { name: "content", type: "richtext", label: "Content" },
        { name: "date", type: "date", label: "Publish Date" },
      ],
    }),
    defineCollection({
      name: "pages",
      label: "Pages",
      urlPrefix: "/",
      fields: [
        { name: "title", type: "text", label: "Title", required: true },
        { name: "content", type: "richtext", label: "Content" },
      ],
    }),
  ],
  storage: {
    adapter: "filesystem",
    filesystem: { contentDir: "content" },
  },
});
