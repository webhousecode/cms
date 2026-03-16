import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: "pages",
      label: "Pages",
      urlPrefix: "/",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "description", type: "textarea" },
      ],
    }),
    defineCollection({
      name: "posts",
      label: "Posts",
      urlPrefix: "/blog",
      fields: [
        { name: "title", type: "text", required: true },
      ],
    }),
  ],
  storage: {
    adapter: "filesystem",
    filesystem: {
      contentDir: "content",
    },
  },
});
