import { cmsSitemap } from "@webhouse/cms/next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export default cmsSitemap({
  baseUrl,
  collections: [
    { name: "pages", urlPrefix: "/" },
    { name: "posts", urlPrefix: "/blog" },
  ],
});
