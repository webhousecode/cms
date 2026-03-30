import { cmsLlmsFullTxt } from "@webhouse/cms/next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export const GET = cmsLlmsFullTxt({
  baseUrl,
  siteTitle: "My Site",
  collections: [
    { name: "pages", label: "Pages", urlPrefix: "/" },
    { name: "posts", label: "Blog Posts", urlPrefix: "/blog" },
  ],
});
