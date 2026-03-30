import { cmsFeed } from "@webhouse/cms/next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export const GET = cmsFeed({
  baseUrl,
  title: "My Site",
  description: "Latest posts and articles",
  collections: [
    { name: "posts", urlPrefix: "/blog" },
  ],
});
